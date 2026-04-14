import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { PreviewIframe } from '@/routes/chat/components/preview-iframe';
import { Smartphone, QrCode } from 'lucide-react';
import type { PreviewComponentProps } from '../../core/types';

type MobileTab = 'preview' | 'qr';

export function MobilePreview({
	previewUrl,
	websocket,
	shouldRefreshPreview,
	manualRefreshTrigger,
	previewRef,
	className,
	featureState,
}: PreviewComponentProps) {
	const [activeTab, setActiveTab] = useState<MobileTab>('preview');

	const expoUrl = featureState.expoUrl as string | undefined;

	if (!previewUrl) {
		return (
			<div
				className={`${className ?? ''} flex items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}
			>
				<div className="text-center p-8">
					<Smartphone className="size-8 text-text-primary/40 mx-auto mb-3" />
					<p className="text-text-primary/70 text-sm">
						No preview URL available yet. The preview will appear once your app
						is deployed.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`${className ?? ''} flex flex-col`}>
			<div className="flex items-center gap-1 px-2 py-1.5 border-b border-text/10 bg-bg-2 shrink-0">
				<button
					onClick={() => setActiveTab('preview')}
					className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
						activeTab === 'preview'
							? 'bg-accent/15 text-accent'
							: 'text-text-primary/60 hover:text-text-primary/80 hover:bg-text/5'
					}`}
				>
					<Smartphone className="size-3.5" />
					Web Preview
				</button>
				<button
					onClick={() => setActiveTab('qr')}
					className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
						activeTab === 'qr'
							? 'bg-accent/15 text-accent'
							: 'text-text-primary/60 hover:text-text-primary/80 hover:bg-text/5'
					}`}
				>
					<QrCode className="size-3.5" />
					QR Code
				</button>
			</div>

			<div className="flex-1 min-h-0">
				{activeTab === 'preview' ? (
					<div className="h-full flex items-center justify-center bg-bg-3 p-4">
						<div className="relative w-[375px] max-w-full h-full max-h-[812px] rounded-[2.5rem] border-[8px] border-zinc-800 dark:border-zinc-600 bg-black overflow-hidden shadow-xl">
							<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-black rounded-b-2xl z-10" />
							<PreviewIframe
								ref={previewRef}
								src={previewUrl}
								className="w-full h-full border-0"
								title="Mobile Preview"
								shouldRefreshPreview={shouldRefreshPreview}
								manualRefreshTrigger={manualRefreshTrigger}
								webSocket={websocket}
							/>
						</div>
					</div>
				) : (
					<div className="h-full flex items-center justify-center bg-bg-3 p-8">
						<div className="flex flex-col items-center gap-6 max-w-sm">
							{expoUrl ? (
								<>
									<div className="bg-white p-4 rounded-2xl shadow-lg">
										<QRCodeSVG
											value={expoUrl}
											size={200}
											level="M"
											includeMargin={false}
										/>
									</div>
									<div className="text-center space-y-2">
										<p className="text-text-primary text-sm font-medium">
											Scan with Expo Go
										</p>
										<p className="text-text-primary/60 text-xs leading-relaxed">
											Open the Expo Go app on your iOS or Android device and
											scan this QR code to preview the app.
										</p>
										<code className="block text-[11px] text-text-primary/40 bg-text/5 px-3 py-1.5 rounded-md mt-2 break-all">
											{expoUrl}
										</code>
									</div>
								</>
							) : (
								<div className="text-center space-y-2">
									<QrCode className="size-10 text-text-primary/30 mx-auto" />
									<p className="text-text-primary/60 text-sm">
										QR code will be available once the tunnel URL is ready.
									</p>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
