import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

interface Superpower {
	name: string;
	filename: string;
	content: string;
}

export function SkillsManager() {
	const [skills, setSkills] = useState<Superpower[]>([]);
	const [loading, setLoading] = useState(true);
	const [showUpload, setShowUpload] = useState(false);
	const [newFilename, setNewFilename] = useState('');
	const [newContent, setNewContent] = useState('');

	const fetchSkills = useCallback(async () => {
		try {
			const res = await apiClient.listSuperpowers();
			setSkills(res.data as Superpower[]);
		} catch {
			// ignore
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchSkills();
	}, [fetchSkills]);

	const handleUpload = async () => {
		if (!newFilename || !newContent) return;
		const filename = newFilename.endsWith('.md') ? newFilename : `${newFilename}.md`;
		await apiClient.uploadSuperpower(filename, newContent);
		setNewFilename('');
		setNewContent('');
		setShowUpload(false);
		await fetchSkills();
	};

	const handleDelete = async (filename: string) => {
		await apiClient.deleteSuperpower(filename);
		await fetchSkills();
	};

	if (loading) {
		return <div className="p-4 text-muted-foreground">Loading skills...</div>;
	}

	return (
		<div className="p-4 space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold">Superpowers / Skills</h3>
				<button
					onClick={() => setShowUpload(!showUpload)}
					className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
				>
					{showUpload ? 'Cancel' : '+ Add Skill'}
				</button>
			</div>

			{showUpload && (
				<div className="space-y-3 p-4 border rounded-lg bg-muted/30">
					<input
						type="text"
						placeholder="filename.md"
						value={newFilename}
						onChange={(e) => setNewFilename(e.target.value)}
						className="w-full px-3 py-2 rounded-md border bg-background text-sm"
					/>
					<textarea
						placeholder="Markdown content for the skill prompt..."
						value={newContent}
						onChange={(e) => setNewContent(e.target.value)}
						rows={6}
						className="w-full px-3 py-2 rounded-md border bg-background text-sm font-mono"
					/>
					<button
						onClick={handleUpload}
						disabled={!newFilename || !newContent}
						className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
					>
						Upload Skill
					</button>
				</div>
			)}

			{skills.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No skills loaded. Upload markdown prompts to add superpowers.
				</p>
			) : (
				<div className="space-y-2">
					{skills.map((skill) => (
						<div
							key={skill.filename}
							className="flex items-center justify-between p-3 border rounded-lg"
						>
							<div>
								<p className="font-medium text-sm">{skill.name}</p>
								<p className="text-xs text-muted-foreground">{skill.filename}</p>
							</div>
							<button
								onClick={() => handleDelete(skill.filename)}
								className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded"
							>
								Delete
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
