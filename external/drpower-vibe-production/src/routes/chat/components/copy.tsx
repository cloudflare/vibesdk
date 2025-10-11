import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Check, Link2 } from 'react-feather';

const MotionCheck = motion.create(Check);
const MotionLink = motion.create(Link2);

export function Copy({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<button
			className="p-1"
			onClick={() => {
				navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => {
					setCopied(false);
				}, 2500);
			}}
		>
			<AnimatePresence>
				{copied ? (
					<MotionCheck
						initial={{ scale: 0.4 }}
						animate={{ scale: 1 }}
						exit={{ scale: 0.4 }}
						className="size-4 text-green-300/70"
					/>
				) : (
					<MotionLink
						initial={{ scale: 0.4 }}
						animate={{ scale: 1 }}
						exit={{ scale: 0.4 }}
						className="size-4 text-text-primary/60"
					/>
				)}
			</AnimatePresence>
		</button>
	);
}
