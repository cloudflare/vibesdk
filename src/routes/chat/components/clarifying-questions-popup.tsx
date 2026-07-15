import { useState, useCallback, useMemo, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
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

	useEffect(() => {
		setAnswers(questions.map((q) => ({ question: q.question, selected: [], custom: '' })));
	}, [questions]);

	const isEmpty = useMemo(
		() => answers.every((a) => a.selected.length === 0 && a.custom.trim() === ''),
		[answers],
	);

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

	const handleSubmit = useCallback(() => {
		onSubmit(answers);
	}, [answers, onSubmit]);

	return (
		<AnimatePresence>
			{open && questions.length > 0 && (
				<motion.div
					initial={{ opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 24 }}
					transition={{ duration: 0.2 }}
				>
					<div
						style={{ paddingBottom: 18, marginBottom: -12 }}
						className="rounded-t-xl border border-b-0 border-border-secondary bg-bg-2 dark:bg-bg-3 shadow-sm px-4 pt-4"
					>
						<div className="flex items-start gap-3 mb-3">
							<div className="mt-0.5 p-1.5 rounded-md bg-brand/10 text-brand">
								<HelpCircle className="size-4" />
							</div>
							<div className="flex-1">
								<h3 className="text-sm font-medium text-text-primary">
									Clarifying questions
								</h3>
								<p className="text-xs text-text-tertiary mt-0.5">
									Answer to help me build what you want.
								</p>
							</div>
							{onDismiss && (
								<Button
									variant="ghost"
									size="icon"
									className="size-7 -mr-2 -mt-2 text-text-tertiary hover:text-text-primary"
									onClick={onDismiss}
									aria-label="Skip questions"
								>
									<X className="size-4" />
								</Button>
							)}
						</div>

						<div className="flex flex-col gap-3">
							{questions.map((q, i) => (
								<div
									key={i}
									className="flex flex-col gap-2 rounded-lg border border-border-secondary bg-bg-4/60 dark:bg-bg-2/50 p-3"
								>
									<div className="flex items-start gap-2 text-sm text-text-primary font-medium">
										<span className="shrink-0 flex items-center justify-center size-5 rounded-full bg-brand/10 text-brand text-xs font-semibold">
											{i + 1}
										</span>
										<span>{q.question}</span>
									</div>
									<div className="flex flex-col gap-2 pl-7">
										{q.options && q.options.length > 0 && (
											q.allow_multiple ? (
												<div className="flex flex-col gap-1.5">
													{q.options.map((option) => {
														const checked = answers[i]?.selected.includes(option) ?? false;
														return (
															<label
																key={option}
																className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary"
															>
																<Checkbox
																	checked={checked}
																	onCheckedChange={() => toggleOption(i, option)}
																	className="border-text-tertiary dark:border-text-tertiary"
																/>
																<span>{option}</span>
															</label>
														);
													})}
												</div>
											) : (
												<RadioGroup
													value={answers[i]?.selected[0] ?? ''}
													onValueChange={(option) => toggleOption(i, option)}
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
												value={answers[i]?.custom ?? ''}
												onChange={(e) => setCustom(i, e.target.value)}
												className="text-sm"
											/>
										)}
									</div>
								</div>
							))}
						</div>

						<div className="flex justify-end gap-2 mt-4">
							{onDismiss && (
								<Button variant="outline" size="sm" onClick={onDismiss}>
									Skip
								</Button>
							)}
							<Button size="sm" onClick={handleSubmit} disabled={isEmpty}>
								Submit answers
							</Button>
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
