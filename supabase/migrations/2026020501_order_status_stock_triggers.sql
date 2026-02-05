-- Migration: Add order status triggers for stock reservations

CREATE OR REPLACE FUNCTION handle_order_status_stock_reservation()
RETURNS TRIGGER AS $$
DECLARE
    v_result JSON;
    v_error TEXT;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'paid' THEN
        v_result := confirm_stock_reservation(NEW.id);
        v_error := v_result->>'error';

        IF COALESCE((v_result->>'success')::BOOLEAN, false) = false
            AND v_error IS NOT NULL
            AND v_error <> 'No active reservations found for this order' THEN
            RAISE EXCEPTION 'Stock reservation confirmation failed for order %: %', NEW.id, v_error;
        END IF;
    ELSIF NEW.status IN ('payment_failed', 'cancelled') THEN
        v_result := release_stock_reservation(NEW.id, NEW.status::TEXT);
        v_error := v_result->>'error';

        IF COALESCE((v_result->>'success')::BOOLEAN, false) = false
            AND v_error IS NOT NULL
            AND v_error <> 'No active reservations found for this order' THEN
            RAISE EXCEPTION 'Stock reservation release failed for order %: %', NEW.id, v_error;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_stock_reservation ON orders;

CREATE TRIGGER trg_orders_stock_reservation
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_order_status_stock_reservation();
