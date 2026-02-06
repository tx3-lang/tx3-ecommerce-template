-- Migration: Implement stock management functions and triggers
-- This migration provides atomic stock reservation, confirmation, and cleanup functions

-- Step 1: Core stock reservation function
CREATE OR REPLACE FUNCTION reserve_stock(
    p_order_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_reservation_minutes INTEGER DEFAULT 30
) RETURNS JSON AS $$
DECLARE
    v_current_stock INTEGER;
    v_reserved_stock INTEGER;
    v_available_stock INTEGER;
    v_reservation_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Validate inputs
    IF p_order_id IS NULL OR p_product_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Invalid input parameters');
    END IF;
    
    -- Calculate expiration time
    v_expires_at := NOW() + (p_reservation_minutes || ' minutes')::INTERVAL;
    
    -- Start atomic operation
    -- Lock the product row to prevent concurrent modifications
    SELECT stock INTO v_current_stock FROM products WHERE id = p_product_id FOR UPDATE;
    
    -- Check if product exists
    IF v_current_stock IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    -- Calculate currently reserved stock for active reservations
    SELECT COALESCE(SUM(CASE 
        WHEN status = 'active' AND expires_at > NOW() THEN quantity 
        ELSE 0 
    END), 0) INTO v_reserved_stock
    FROM stock_reservations 
    WHERE product_id = p_product_id;
    
    -- Calculate available stock
    v_available_stock := v_current_stock - v_reserved_stock;
    
    -- Check if stock is available
    IF v_available_stock < p_quantity THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Insufficient stock available',
            'available', v_available_stock,
            'requested', p_quantity
        );
    END IF;
    
    -- Create the reservation
    INSERT INTO stock_reservations (
        order_id, 
        product_id, 
        quantity, 
        expires_at,
        status
    ) VALUES (
        p_order_id, 
        p_product_id, 
        p_quantity, 
        v_expires_at,
        'active'
    ) RETURNING id INTO v_reservation_id;
    
    -- Return success with reservation details
    RETURN json_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'expires_at', v_expires_at,
        'remaining_stock', v_available_stock - p_quantity
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Rollback is automatic due to exception
        RETURN json_build_object(
            'success', false, 
            'error', 'Database error: ' || SQLERRM
        );
END;
$$ LANGUAGE plpgsql;

-- Step 2: Confirm stock reservation (when payment succeeds)
CREATE OR REPLACE FUNCTION confirm_stock_reservation(
    p_order_id UUID
) RETURNS JSON AS $$
DECLARE
    v_updated_count INTEGER;
    v_total_quantity INTEGER;
BEGIN
    -- Update reservations to confirmed status
    UPDATE stock_reservations 
    SET status = 'confirmed', updated_at = NOW()
    WHERE order_id = p_order_id 
    AND status = 'active';
    
    -- Get total quantity from confirmed reservations
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_quantity
    FROM stock_reservations
    WHERE order_id = p_order_id AND status = 'confirmed';
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    IF v_updated_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No active reservations found for this order');
    END IF;
    
    -- Update product stock (deduct confirmed reservations)
    UPDATE products 
    SET stock = stock - v_total_quantity,
        updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT product_id 
        FROM stock_reservations 
        WHERE order_id = p_order_id
    );
    
    RETURN json_build_object(
        'success', true,
        'reservations_confirmed', v_updated_count,
        'quantity_deducted', v_total_quantity
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Step 3: Release stock reservation (when payment fails or order is cancelled)
CREATE OR REPLACE FUNCTION release_stock_reservation(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'cancelled'
) RETURNS JSON AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Update reservations to released status
    UPDATE stock_reservations 
    SET status = 'released', updated_at = NOW()
    WHERE order_id = p_order_id 
    AND status IN ('active', 'expired');
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    IF v_updated_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No active reservations found for this order');
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'reservations_released', v_updated_count,
        'reason', p_reason
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Step 4: Cleanup expired reservations (for background job)
CREATE OR REPLACE FUNCTION cleanup_expired_reservations() RETURNS JSON AS $$
DECLARE
    v_updated_count INTEGER;
    v_total_quantity INTEGER;
BEGIN
    -- Find and mark expired reservations
    WITH updated AS (
        UPDATE stock_reservations
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'active'
        AND expires_at < NOW()
        RETURNING quantity
    )
    SELECT COALESCE(SUM(quantity), 0), COUNT(*)
    INTO v_total_quantity, v_updated_count
    FROM updated;
    
    -- Return results for logging
    RETURN json_build_object(
        'success', true,
        'reservations_expired', v_updated_count,
        'quantity_released', v_total_quantity,
        'timestamp', NOW()
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Step 5: Bulk stock reservation for multi-item orders
CREATE OR REPLACE FUNCTION reserve_bulk_stock(
    p_order_id UUID,
    p_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSON AS $$
DECLARE
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_results JSONB := '[]'::JSONB;
    v_total_success INTEGER := 0;
    v_total_failed INTEGER := 0;
    v_all_successful BOOLEAN := true;
BEGIN
    -- Validate order_id
    IF p_order_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Order ID is required');
    END IF;
    
    -- Process each item
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item ->> 'product_id')::UUID;
        v_quantity := (v_item ->> 'quantity')::INTEGER;
        
        -- Attempt to reserve stock for this item
        PERFORM reserve_stock(p_order_id, v_product_id, v_quantity);
        
        -- Check the result and add to results array
        IF FOUND THEN
            -- Get the reservation result (simplified check)
            v_results := v_results || jsonb_build_object(
                'product_id', v_product_id,
                'quantity', v_quantity,
                'success', true
            );
            v_total_success := v_total_success + 1;
        ELSE
            v_results := v_results || jsonb_build_object(
                'product_id', v_product_id,
                'quantity', v_quantity,
                'success', false
            );
            v_total_failed := v_total_failed + 1;
            v_all_successful := false;
        END IF;
    END LOOP;
    
    -- If any reservation failed, rollback all
    IF NOT v_all_successful THEN
        PERFORM release_stock_reservation(p_order_id, 'bulk_reservation_failed');
        RETURN json_build_object(
            'success', false,
            'error', 'Some items could not be reserved',
            'successful', v_total_success,
            'failed', v_total_failed,
            'details', v_results
        );
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'items_reserved', v_total_success,
        'details', v_results
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Clean up any partial reservations
        PERFORM release_stock_reservation(p_order_id, 'exception_occurred');
        RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Step 6: Get available stock (considering active reservations)
CREATE OR REPLACE FUNCTION get_available_stock(
    p_product_id UUID
) RETURNS INTEGER AS $$
DECLARE
    v_current_stock INTEGER;
    v_reserved_stock INTEGER;
BEGIN
    -- Get current product stock
    SELECT stock INTO v_current_stock FROM products WHERE id = p_product_id;
    
    -- Return NULL if product doesn't exist
    IF v_current_stock IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Get currently reserved stock
    SELECT COALESCE(SUM(CASE 
        WHEN status = 'active' AND expires_at > NOW() THEN quantity 
        ELSE 0 
    END), 0) INTO v_reserved_stock
    FROM stock_reservations 
    WHERE product_id = p_product_id;
    
    -- Return available stock
    RETURN GREATEST(0, v_current_stock - v_reserved_stock);
END;
$$ LANGUAGE plpgsql;

-- Step 7: Bulk stock validation (optimized for cart validation)
CREATE OR REPLACE FUNCTION validate_bulk_stock(
    p_items JSONB
) RETURNS JSONB AS $$
DECLARE
    v_item JSONB;
    v_product_id UUID;
    v_required_quantity INTEGER;
    v_current_stock INTEGER;
    v_reserved_stock INTEGER;
    v_available_stock INTEGER;
    v_results JSONB := '[]'::JSONB;
    v_all_items_available BOOLEAN := true;
BEGIN
    -- Validate input
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'No items provided for validation',
            'items', '[]'::JSONB
        );
    END IF;
    
    -- Process each item
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item ->> 'product_id')::UUID;
        v_required_quantity := (v_item ->> 'quantity')::INTEGER;
        
        -- Get current product stock
        SELECT stock INTO v_current_stock FROM products WHERE id = v_product_id;
        
        -- Check if product exists
        IF v_current_stock IS NULL THEN
            v_results := v_results || jsonb_build_object(
                'product_id', v_product_id,
                'required_quantity', v_required_quantity,
                'has_sufficient_stock', false,
                'available_stock', NULL,
                'can_proceed', false,
                'error', 'Product not found'
            );
            v_all_items_available := false;
            CONTINUE;
        END IF;
        
        -- Calculate currently reserved stock
        SELECT COALESCE(SUM(CASE 
            WHEN status = 'active' AND expires_at > NOW() THEN quantity 
            ELSE 0 
        END), 0) INTO v_reserved_stock
        FROM stock_reservations 
        WHERE product_id = v_product_id;
        
        -- Calculate available stock
        v_available_stock := GREATEST(0, v_current_stock - v_reserved_stock);
        
        -- Check if sufficient stock is available
        IF v_available_stock >= v_required_quantity THEN
            v_results := v_results || jsonb_build_object(
                'product_id', v_product_id,
                'required_quantity', v_required_quantity,
                'has_sufficient_stock', true,
                'available_stock', v_available_stock,
                'can_proceed', true
            );
        ELSE
            v_results := v_results || jsonb_build_object(
                'product_id', v_product_id,
                'required_quantity', v_required_quantity,
                'has_sufficient_stock', false,
                'available_stock', v_available_stock,
                'can_proceed', false
            );
            v_all_items_available := false;
        END IF;
    END LOOP;
    
    -- Return consolidated results
    RETURN json_build_object(
        'success', v_all_items_available,
        'message', CASE 
            WHEN v_all_items_available THEN 'All items have sufficient stock'
            ELSE 'Some items have insufficient stock'
        END,
        'items', v_results
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Database error: ' || SQLERRM,
            'items', '[]'::JSONB
        );
END;
$$ LANGUAGE plpgsql;

-- Step 8: Auto-cancel orders with expired reservations
CREATE OR REPLACE FUNCTION auto_cancel_expired_orders() RETURNS JSON AS $$
DECLARE
    v_cancelled_count INTEGER := 0;
    v_order_id UUID;
BEGIN
    -- Find and cancel orders that have all reservations expired
    FOR v_order_id IN 
        SELECT DISTINCT o.id
        FROM orders o
        INNER JOIN stock_reservations sr ON o.id = sr.order_id
        WHERE o.status = 'pending'
        AND sr.status = 'expired'
        GROUP BY o.id
        -- Only cancel if ALL reservations for this order are expired
        HAVING COUNT(*) = COUNT(*) FILTER (WHERE sr.status = 'expired')
    LOOP
        -- Update order status to cancelled
        UPDATE orders
        SET status = 'cancelled', 
            updated_at = NOW()
        WHERE id = v_order_id;
        
        v_cancelled_count := v_cancelled_count + 1;
    END LOOP;
    
    -- Return results for logging
    RETURN json_build_object(
        'success', true,
        'orders_cancelled', v_cancelled_count,
        'timestamp', NOW()
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Step 9: Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_active 
ON stock_reservations(product_id, expires_at) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_stock_reservations_status_expires 
ON stock_reservations(status, expires_at) 
WHERE status IN ('active', 'expired');

CREATE INDEX IF NOT EXISTS idx_orders_status_pending
ON orders(status) 
WHERE status = 'pending';

-- Step 10: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE 'Stock management functions created successfully';
    RAISE NOTICE 'Functions available: reserve_stock, confirm_stock_reservation, release_stock_reservation, cleanup_expired_reservations, auto_cancel_expired_orders';
    RAISE NOTICE 'Helper functions: reserve_bulk_stock, get_available_stock, validate_bulk_stock';
END $$;