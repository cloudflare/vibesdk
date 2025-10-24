#!/usr/bin/env python3
"""
Extract Serialized Files from AI Gateway Logs

This tool extracts serialized files from OpenAI API request/response logs,
saves them to organized folders, and generates detailed reports comparing
the actual extracted files with the serialized file tree metadata.

Usage:
    python extract_serialized_files.py <log_file_path> [<log_file_path> ...]
    
Example:
    python extract_serialized_files.py ai-gateway-log-01K89AYMH3N5TK81SM9N8EJKHB.json
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from collections import defaultdict


class FileExtractor:
    """Extract files from bash heredoc format in API logs"""
    
    def __init__(self, log_path: str):
        self.log_path = Path(log_path)
        self.log_data = self._load_log()
        self.metadata = self.log_data.get('metadata', {})
        self.chat_id = self.metadata.get('chatId', 'unknown')
        self.action_key = self.metadata.get('actionKey', 'unknown')
        self.output_dir = Path(f'debug-tools/extracted/{self.action_key}_{self.chat_id}')
        
    def _load_log(self) -> dict:
        """Load and parse the JSON log file"""
        with open(self.log_path, 'r') as f:
            return json.load(f)
    
    def _extract_files_from_text(self, text: str, source: str) -> Dict[str, str]:
        """
        Extract files from bash heredoc format.
        Format: cat > filepath << 'EOF'\n...content...\nEOF
        """
        files = {}
        
        # Pattern to match: cat > filepath << 'EOF' ... EOF
        # Using re.DOTALL to match across newlines
        pattern = r"cat > ([^\s<]+) << 'EOF'\n(.*?)\nEOF"
        matches = re.finditer(pattern, text, re.DOTALL)
        
        for match in matches:
            filepath = match.group(1)
            content = match.group(2)
            
            # Handle duplicate files by appending a counter
            original_filepath = filepath
            counter = 1
            while filepath in files:
                base, ext = os.path.splitext(original_filepath)
                filepath = f"{base}_v{counter}{ext}"
                counter += 1
            
            files[filepath] = content
            print(f"  [{source}] Extracted: {filepath} ({len(content)} bytes)")
        
        return files
    
    def _extract_structured_files(self, text: str, source: str) -> Dict[str, str]:
        """
        Extract files from structured format used in blueprint requests.
        Format: #### filePath\n\n```\npath/to/file\n```\n\n#### fileContents\n\n```\ncontent\n```
        """
        files = {}
        
        # Pattern to match structured file format
        pattern = r'#### filePath\s*```\s*([^`]+?)\s*```\s*#### fileContents\s*```(?:[a-z]*\n)?(.*?)```'
        matches = re.finditer(pattern, text, re.DOTALL)
        
        for match in matches:
            filepath = match.group(1).strip()
            content = match.group(2)
            
            # Handle duplicate files by appending a counter
            original_filepath = filepath
            counter = 1
            while filepath in files:
                base, ext = os.path.splitext(original_filepath)
                filepath = f"{base}_v{counter}{ext}"
                counter += 1
            
            files[filepath] = content
            print(f"  [{source}] Extracted: {filepath} ({len(content)} bytes)")
        
        return files
    
    def _extract_file_tree_from_text(self, text: str) -> Optional[str]:
        """Extract the file tree metadata from the request"""
        # Look for file tree section
        patterns = [
            r'<TEMPLATE_FILE_TREE>(.*?)</TEMPLATE_FILE_TREE>',
            r'<FILE_TREE>(.*?)</FILE_TREE>',
            r'<CODEBASE.*?>(.*?)</CODEBASE>',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _build_actual_tree(self, files: Dict[str, str]) -> str:
        """Build a tree representation of actually extracted files"""
        if not files:
            return "No files extracted"
        
        # Group files by directory
        tree = defaultdict(list)
        for filepath in sorted(files.keys()):
            parts = Path(filepath).parts
            if len(parts) == 1:
                tree['.'].append(filepath)
            else:
                directory = str(Path(*parts[:-1]))
                filename = parts[-1]
                tree[directory].append(filename)
        
        # Build tree string
        lines = []
        for directory in sorted(tree.keys()):
            if directory != '.':
                lines.append(f"{directory}/")
            for filename in sorted(tree[directory]):
                if directory == '.':
                    lines.append(f"  {filename}")
                else:
                    lines.append(f"  └── {filename}")
        
        return '\n'.join(lines)
    
    def _save_files(self, files: Dict[str, str], subdirectory: str = ''):
        """Save extracted files to disk"""
        if not files:
            print(f"  No files to save in {subdirectory or 'root'}")
            return
        
        base_dir = self.output_dir / subdirectory if subdirectory else self.output_dir
        base_dir.mkdir(parents=True, exist_ok=True)
        
        for filepath, content in files.items():
            output_path = base_dir / filepath
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content)
        
        print(f"  Saved {len(files)} files to {base_dir}")
    
    def _generate_report(self, request_files: Dict[str, str], 
                        response_files: Dict[str, str],
                        serialized_tree: Optional[str]) -> str:
        """Generate a detailed comparison report"""
        lines = [
            "=" * 80,
            f"FILE EXTRACTION REPORT",
            "=" * 80,
            "",
            "## Metadata",
            f"  Chat ID:     {self.chat_id}",
            f"  Action Key:  {self.action_key}",
            f"  Log File:    {self.log_path.name}",
            f"  Output Dir:  {self.output_dir}",
            "",
            "=" * 80,
            "## REQUEST FILES (Serialized Input)",
            "=" * 80,
            "",
        ]
        
        if request_files:
            lines.append(f"Total files extracted from request: {len(request_files)}")
            lines.append("")
            lines.append("### File List:")
            for filepath, content in sorted(request_files.items()):
                lines.append(f"  - {filepath} ({len(content):,} bytes)")
            lines.append("")
            lines.append("### Actual File Tree (from extracted files):")
            lines.append(self._build_actual_tree(request_files))
        else:
            lines.append("No files found in request")
        
        lines.extend([
            "",
            "=" * 80,
            "## RESPONSE FILES (AI Generated)",
            "=" * 80,
            "",
        ])
        
        if response_files:
            lines.append(f"Total files generated in response: {len(response_files)}")
            lines.append("")
            lines.append("### File List:")
            for filepath, content in sorted(response_files.items()):
                lines.append(f"  - {filepath} ({len(content):,} bytes)")
            lines.append("")
            lines.append("### Actual File Tree (from generated files):")
            lines.append(self._build_actual_tree(response_files))
        else:
            lines.append("No files found in response")
        
        if serialized_tree:
            lines.extend([
                "",
                "=" * 80,
                "## SERIALIZED FILE TREE (from request metadata)",
                "=" * 80,
                "",
                serialized_tree,
            ])
        
        lines.extend([
            "",
            "=" * 80,
            "## COMPARISON",
            "=" * 80,
            "",
        ])
        
        # Compare counts
        lines.append(f"Request files:  {len(request_files)}")
        lines.append(f"Response files: {len(response_files)}")
        lines.append(f"Total files:    {len(request_files) + len(response_files)}")
        
        # Check for duplicates
        common_files = set(request_files.keys()) & set(response_files.keys())
        if common_files:
            lines.append("")
            lines.append(f"⚠️  WARNING: {len(common_files)} files appear in both request and response:")
            for filepath in sorted(common_files):
                lines.append(f"  - {filepath}")
        
        lines.extend([
            "",
            "=" * 80,
            "## SUMMARY",
            "=" * 80,
            "",
            f"✓ Extraction completed successfully",
            f"✓ Files saved to: {self.output_dir}",
            f"✓ Report saved to: {self.output_dir}/REPORT.md",
            "",
        ])
        
        return '\n'.join(lines)
    
    def _parse_json_content(self, content: str, is_request: bool = False) -> str:
        """Parse JSON-encoded content if needed"""
        try:
            # Try to parse as JSON in case it's double-encoded
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                if is_request:
                    # For requests, content is in messages array
                    if 'messages' in parsed:
                        # Combine all message contents
                        all_content = []
                        for msg in parsed['messages']:
                            if 'content' in msg:
                                all_content.append(msg['content'])
                        return '\n\n'.join(all_content)
                else:
                    # For responses, content is in choices[0].delta.content or choices[0].message.content
                    if 'choices' in parsed and len(parsed['choices']) > 0:
                        choice = parsed['choices'][0]
                        if 'delta' in choice and 'content' in choice['delta']:
                            return choice['delta']['content']
                        elif 'message' in choice and 'content' in choice['message']:
                            return choice['message']['content']
            elif isinstance(parsed, str):
                return parsed
            return content
        except (json.JSONDecodeError, KeyError, IndexError):
            return content
    
    def extract_all(self):
        """Main extraction method"""
        print(f"\n{'='*80}")
        print(f"Processing: {self.log_path.name}")
        print(f"Action: {self.action_key} | Chat ID: {self.chat_id}")
        print(f"{'='*80}\n")
        
        # Extract files from request
        print("Extracting files from REQUEST...")
        request_head = self._parse_json_content(self.log_data.get('request_head', ''), is_request=True)
        request_files = self._extract_files_from_text(request_head, 'REQUEST')
        # Also try structured format
        structured_files = self._extract_structured_files(request_head, 'REQUEST')
        request_files.update(structured_files)
        serialized_tree = self._extract_file_tree_from_text(request_head)
        
        # Extract files from response
        print("\nExtracting files from RESPONSE...")
        response_head = self._parse_json_content(self.log_data.get('response_head', ''), is_request=False)
        response_files = self._extract_files_from_text(response_head, 'RESPONSE')
        # Also try structured format
        structured_response = self._extract_structured_files(response_head, 'RESPONSE')
        response_files.update(structured_response)
        
        # Save files
        print("\nSaving extracted files...")
        if request_files:
            self._save_files(request_files, 'request')
        if response_files:
            self._save_files(response_files, 'response')
        
        # Generate report
        print("\nGenerating report...")
        report = self._generate_report(request_files, response_files, serialized_tree)
        
        # Save report
        report_path = self.output_dir / 'REPORT.md'
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, 'w') as f:
            f.write(report)
        
        print(report)
        
        return len(request_files) + len(response_files)


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nError: No log files provided")
        sys.exit(1)
    
    log_files = sys.argv[1:]
    total_files = 0
    
    print("\n" + "="*80)
    print("AI GATEWAY LOG FILE EXTRACTOR")
    print("="*80)
    print(f"\nProcessing {len(log_files)} log file(s)...\n")
    
    for log_file in log_files:
        if not Path(log_file).exists():
            print(f"❌ Error: File not found: {log_file}")
            continue
        
        try:
            extractor = FileExtractor(log_file)
            count = extractor.extract_all()
            total_files += count
        except Exception as e:
            print(f"❌ Error processing {log_file}: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "="*80)
    print(f"EXTRACTION COMPLETE")
    print("="*80)
    print(f"\nTotal files extracted: {total_files}")
    print(f"Output directory: debug-tools/extracted/")
    print("\n")


if __name__ == '__main__':
    main()
