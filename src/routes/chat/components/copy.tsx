import { AnimatePresence, motion } from 'framer-motion';
import { Check, Link2 } from 'react-feather';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

const MotionCheck = motion.create(Check);
const MotionLink = motion.create(Link2);

export function Copy({ text }: { text: string }) {
	const { copied, copy } = useCopyToClipboard();

	return (
		<button className="p-1" onClick={() => copy(text)}>
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
