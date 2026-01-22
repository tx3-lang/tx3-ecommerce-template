interface Step {
	id: string;
	label: string;
}

interface StepIndicatorProps {
	current: string;
	steps: Step[];
}

export function StepIndicator({ current, steps }: StepIndicatorProps) {
	const getCurrentIndex = () => {
		return steps.findIndex(step => step.id === current);
	};

	const currentIndex = getCurrentIndex();

	return (
		<div className="flex items-center justify-center space-x-4">
			{steps.map((step, index) => (
				<div key={step.id} className="flex items-center">
					<div
						className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
							index <= currentIndex ? 'bg-primary text-primary-foreground' : 'bg-gray-200 text-gray-600'
						}`}
					>
						{index + 1}
					</div>
					<span className={`ml-2 text-sm ${index <= currentIndex ? 'text-primary font-medium' : 'text-gray-600'}`}>
						{step.label}
					</span>
					{index < steps.length - 1 && (
						<div className={`w-8 h-0.5 mx-4 ${index < currentIndex ? 'bg-primary' : 'bg-gray-300'}`} />
					)}
				</div>
			))}
		</div>
	);
}
