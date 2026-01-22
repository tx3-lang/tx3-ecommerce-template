import { IconMinus, IconPlus } from '@tabler/icons-react';
import { forwardRef, type InputHTMLAttributes, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface QuantitySelectorProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'size'> {
	value?: number;
	min?: number;
	max?: number;
	step?: number;
	onChange?: (value: number) => void;
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;
}

export const QuantitySelector = forwardRef<HTMLInputElement, QuantitySelectorProps>(
	({ value = 1, min = 1, max = 999, step = 1, onChange, size = 'md', disabled = false, className, ...props }, ref) => {
		const [internalValue, setInternalValue] = useState(value);

		// Sync internal state with prop value
		useEffect(() => {
			setInternalValue(value);
		}, [value]);

		const handleIncrement = () => {
			const newValue = Math.min(internalValue + step, max);
			setInternalValue(newValue);
			onChange?.(newValue);
		};

		const handleDecrement = () => {
			const newValue = Math.max(internalValue - step, min);
			setInternalValue(newValue);
			onChange?.(newValue);
		};

		const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			const inputValue = e.target.value;
			const numValue = parseInt(inputValue, 10);

			if (Number.isNaN(numValue)) {
				setInternalValue(min);
				onChange?.(min);
				return;
			}

			const clampedValue = Math.max(min, Math.min(max, numValue));
			setInternalValue(clampedValue);
			onChange?.(clampedValue);
		};

		const handleBlur = () => {
			if (internalValue < min) {
				setInternalValue(min);
				onChange?.(min);
			} else if (internalValue > max) {
				setInternalValue(max);
				onChange?.(max);
			}
		};

		const canIncrement = internalValue < max && !disabled;
		const canDecrement = internalValue > min && !disabled;

		const sizeClasses = {
			sm: 'h-8 text-sm',
			md: 'h-10 text-base',
			lg: 'h-12 text-lg',
		};

		const buttonSizeClasses = {
			sm: 'h-8 w-8',
			md: 'h-10 w-10',
			lg: 'h-12 w-12',
		};

		return (
			<div className={cn('flex items-center border border-gray-300 rounded-md', className, sizeClasses[size])}>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleDecrement}
					disabled={!canDecrement}
					className={cn('rounded-r-none border-r border-gray-300', buttonSizeClasses[size])}
					aria-label="Decrease quantity"
				>
					<IconMinus size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
				</Button>

				<input
					ref={ref}
					type="number"
					value={internalValue}
					onChange={handleInputChange}
					onBlur={handleBlur}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					className={cn(
						'w-16 text-center border-0 focus:outline-none focus:ring-0',
						sizeClasses[size],
						disabled && 'bg-gray-100 text-gray-500 cursor-not-allowed',
					)}
					{...props}
				/>

				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleIncrement}
					disabled={!canIncrement}
					className={cn('rounded-l-none border-l border-gray-300', buttonSizeClasses[size])}
					aria-label="Increase quantity"
				>
					<IconPlus size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
				</Button>
			</div>
		);
	},
);

QuantitySelector.displayName = 'QuantitySelector';
