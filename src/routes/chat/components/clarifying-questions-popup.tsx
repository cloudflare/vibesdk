import { useState, useCallback, useEffect, useRef } from 'react';
import { HelpCircle, X, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import type { ClarifyingQuestion } from '../utils/message-helpers';

export type QuestionAnswer = {
	question: string;
	selected: string[];
	custom: string;
};

interface ClarifyingQuestionsPopupProps {
	questions: ClarifyingQuestion[];
	open: boolean;
	onSubmit: (answers: QuestionAnswer[]) => void;
	onDismiss?: () => void;
}

export function ClarifyingQuestionsPopup({
	questions,
	open,
	onSubmit,
	onDismiss,
}: ClarifyingQuestionsPopupProps) {
	const [answers, setAnswers] = useState<QuestionAnswer[]>(() =>
		questions.map((q) => ({ question: q.question, selected: [], custom: '' })),
	);
	// Index of the question currently on screen (slide-style, one at a time).
	const [current, setCurrent] = useState(0);
	// Slide direction for the enter/exit animation: 1 = forward, -1 = back.
	const directionRef = useRef(1);

	useEffect(() => {
		setAnswers(questions.map((q) => ({ question: q.question, selected: [], custom: '' })));
		setCurrent(0);
		directionRef.current = 1;
	}, [questions]);

	const total = questions.length;
	const isLast = current === total - 1;
	const currentAnswer = answers[current];
	const isAnswered =
		(currentAnswer?.selected.length ?? 0) > 0 ||
		(currentAnswer?.custom.trim() ?? '') !== '';

	const toggleOption = useCallback((questionIndex: number, option: string) => {
		setAnswers((prev) => {
			const next = [...prev];
			const current = next[questionIndex];
			if (!current) return prev;
			const q = questions[questionIndex];
			const allowMultiple = q?.allow_multiple ?? false;
			if (current.selected.includes(option)) {
				next[questionIndex] = {
					...current,
					selected: current.selected.filter((o) => o !== option),
				};
			} else if (allowMultiple) {
				next[questionIndex] = {
					...current,
					selected: [...current.selected, option],
					custom: '',
				};
			} else {
				next[questionIndex] = {
					...current,
					selected: [option],
					custom: '',
				};
			}
			return next;
		});
	}, [questions]);

	const setCustom = useCallback((questionIndex: number, value: string) => {
		setAnswers((prev) => {
			const next = [...prev];
			const current = next[questionIndex];
			if (!current) return prev;
			next[questionIndex] = {
				...current,
				custom: value,
				selected: value.trim() === '' ? current.selected : [],
			};
			return next;
		});
	}, []);

	const goBack = useCallback(() => {
		directionRef.current = -1;
		setCurrent((c) => Math.max(0, c - 1));
	}, []);

	// Advance to the next question, or finish on the last one. `skip` simply
	// leaves the current answer empty; answered questions carry their value.
	const goNext = useCallback(() => {
		if (isLast) {
			onSubmit(answers);
			return;
		}
		directionRef.current = 1;
		setCurrent((c) => Math.min(total - 1, c + 1));
	}, [isLast, onSubmit, answers, total]);

	const q = questions[current];

	return (
		<AnimatePresence>
			{open && total > 0 && q && (
				<motion.div
					initial={{ opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 24 }}
					transition={{ duration: 0.2 }}
				>
					<div
						style={{ paddingBottom: 18, marginBottom: -12 }}
						className="rounded-t-xl border border-b-0 bg-kumo-elevated dark:bg-kumo-base shadow-sm px-4 pt-4"
					>
						<div className="flex items-start gap-3 mb-3">
							<div className="mt-0.5 p-1.5 rounded-md bg-brand/10 text-kumo-brand">
								<HelpCircle className="size-4" />
							</div>
							<div className="flex-1 min-w-0">
								<h3 className="text-sm font-medium text-text-primary">
									Clarifying questions
								</h3>
								<p className="text-xs text-text-tertiary mt-0.5">
									Answer to help me build what you want.
								</p>
							</div>
							<span className="shrink-0 text-xs font-medium text-text-tertiary tabular-nums mt-0.5">
								{current + 1}/{total}
							</span>
							{onDismiss && (
								<Button
									variant="ghost"
									size="icon"
									className="size-7 -mr-2 -mt-2 text-text-tertiary hover:text-text-primary"
									onClick={onDismiss}
									aria-label="Skip all questions"
								>
									<X className="size-4" />
								</Button>
							)}
						</div>

						{/* Progress segments */}
						<div className="flex gap-1 mb-3">
							{questions.map((_, i) => (
								<div
									key={i}
									className={`h-1 flex-1 rounded-full transition-colors ${
									i < current
										? 'bg-brand'
										: i === current
											? 'bg-brand/60'
											: 'bg-border-secondary'
									}`}
							/>
							))}
						</div>

						<div className="relative overflow-hidden">
							<AnimatePresence mode="wait" custom={directionRef.current}>
								<motion.div
									key={current}
									custom={directionRef.current}
									initial={{ opacity: 0, x: directionRef.current * 40 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: directionRef.current * -40 }}
									transition={{ duration: 0.18 }}
									className="flex flex-col gap-2 rounded-lg border bg-bg-4/60 dark:bg-kumo-elevated/50 p-3"
								>
									<div className="text-sm text-text-primary font-medium">
										{q.question}
									</div>
									<div className="flex flex-col gap-2">
										{q.options && q.options.length > 0 && (
											q.allow_multiple ? (
												<div className="flex flex-col gap-1.5">
													{q.options.map((option) => {
														const checked = currentAnswer?.selected.includes(option) ?? false;
														return (
															<label
																key={option}
																className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary"
															>
																<Checkbox
																	checked={checked}
																	onCheckedChange={() => toggleOption(current, option)}
																	className="border-text-tertiary dark:border-text-tertiary"
																/>
																<span>{option}</span>
															</label>
														);
													})}
												</div>
											) : (
												<RadioGroup
													value={currentAnswer?.selected[0] ?? ''}
													onValueChange={(option) => toggleOption(current, option)}
													className="gap-1.5"
												>
													{q.options.map((option) => (
														<label
															key={option}
															className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary"
														>
															<RadioGroupItem
																value={option}
																className="border-text-tertiary dark:border-text-tertiary"
															/>
															<span>{option}</span>
														</label>
													))}
												</RadioGroup>
											)
										)}
										{q.allow_custom !== false && (
											<Input
												placeholder="Or add your own answer"
												value={currentAnswer?.custom ?? ''}
												onChange={(e) => setCustom(current, e.target.value)}
												className="text-sm"
											/>
										)}
									</div>
								</motion.div>
							</AnimatePresence>
						</div>

						<div className="flex items-center justify-between gap-2 mt-4">
							<Button
								variant="ghost"
								size="sm"
								onClick={goBack}
								disabled={current === 0}
								className="text-text-tertiary hover:text-text-primary"
							>
								<ArrowLeft className="size-4 mr-1" />
								Back
							</Button>
							<div className="flex items-center gap-2">
								<Button variant="outline" size="sm" onClick={goNext}>
									{isLast ? 'Skip & finish' : 'Skip'}
								</Button>
								<Button size="sm" onClick={goNext} disabled={!isAnswered}>
									{isLast ? (
										<>
											<Check className="size-4 mr-1" />
											Submit
										</>
									) : (
										<>
											Next
											<ArrowRight className="size-4 ml-1" />
										</>
									)}
								</Button>
							</div>
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
