#!/usr/bin/env python3
"""
Migration Algorithm Tester & Enhanced Analytics

This script tests the migration algorithm from the TypeScript code and provides
comprehensive analytics about conversation messages before and after migration.

Usage: python migration_tester.py
"""

import json
import os
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass
from collections import Counter, defaultdict

@dataclass
class MigrationResult:
    original_count: int
    deduplicated_count: int
    final_count: int
    duplicates_removed: int
    old_messages_removed: int
    unique_conversation_ids: List[str]
    longest_message: Dict[str, Any]
    final_messages: List[Dict[str, Any]]

class MigrationTester:
    """Tests the exact migration algorithm from TypeScript code"""
    
    def __init__(self):
        self.MAX_CONVERSATION_MESSAGES = 50
    
    def extract_timestamp_from_id(self, conversation_id: str) -> int:
        """Extract timestamp from conversationId (format: conv-{timestamp}-{random})"""
        if conversation_id and conversation_id.startswith('conv-'):
            parts = conversation_id.split('-')
            if len(parts) >= 2:
                try:
                    return int(parts[1])
                except ValueError:
                    return 0
        return 0
    
    def apply_migration_algorithm(self, messages: List[Dict[str, Any]]) -> MigrationResult:
        """Apply the exact migration algorithm from TypeScript code"""
        print(f"🧪 Testing updated migration algorithm on {len(messages)} messages...")
        
        original_count = len(messages)
        MIN_MESSAGES_FOR_CLEANUP = 25
        
        # Deduplicate messages by conversationId
        seen = set()
        unique_messages = []
        
        for message in messages:
            # Use conversationId as primary unique key since it should be unique per message
            key = message.get('conversationId')
            if not key:
                # Fallback for messages without conversationId
                content = message.get('content', '')
                if isinstance(content, str):
                    content_str = content[:100]
                else:
                    content_str = json.dumps(content, default=str)[:100]
                key = f"{message.get('role', 'unknown')}_{content_str}_{self.extract_timestamp_from_id('')}"
            
            if key not in seen:
                seen.add(key)
                unique_messages.append(message)
        
        # Sort messages by timestamp (extracted from conversationId) to maintain chronological order
        unique_messages.sort(key=lambda msg: self.extract_timestamp_from_id(msg.get('conversationId', '')))
        
        # Smart filtering: if we have more than MIN_MESSAGES_FOR_CLEANUP, remove internal memos but keep actual conversations
        final_messages = unique_messages
        internal_memos_removed = 0
        
        if len(unique_messages) > MIN_MESSAGES_FOR_CLEANUP:
            real_conversations = []
            internal_memos = []
            
            for message in unique_messages:
                content = message.get('content', '')
                if isinstance(content, str):
                    content_str = content
                else:
                    content_str = json.dumps(content, default=str)
                
                is_internal_memo = '**<Internal Memo>**' in content_str or 'Project Updates:' in content_str
                
                if is_internal_memo:
                    internal_memos.append(message)
                else:
                    real_conversations.append(message)
            
            print(f"   📊 Smart filtering analysis:")
            print(f"      Real conversations: {len(real_conversations)}")
            print(f"      Internal memos: {len(internal_memos)}")
            print(f"      Will remove internal memos: {len(unique_messages) > MIN_MESSAGES_FOR_CLEANUP}")
            
            # Keep all real conversations, remove internal memos if we exceed the threshold
            final_messages = real_conversations
            internal_memos_removed = len(internal_memos)
        
        # Find longest message
        longest_message = max(messages, key=lambda m: len(json.dumps(m, default=str))) if messages else {}
        
        # Get unique conversation IDs
        unique_ids = list(set(msg.get('conversationId') for msg in unique_messages if msg.get('conversationId')))
        
        return MigrationResult(
            original_count=original_count,
            deduplicated_count=len(unique_messages),
            final_count=len(final_messages),
            duplicates_removed=original_count - len(unique_messages),
            old_messages_removed=internal_memos_removed,
            unique_conversation_ids=unique_ids,
            longest_message=longest_message,
            final_messages=final_messages
        )
    
    def analyze_unique_conversations(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze all unique conversation IDs and their patterns"""
        print("🔍 Analyzing unique conversation patterns...")
        
        # Group messages by conversationId
        conversations = defaultdict(list)
        for msg in messages:
            conv_id = msg.get('conversationId', 'no-id')
            conversations[conv_id].append(msg)
        
        # Analyze each unique conversation
        conversation_analysis = {}
        for conv_id, msgs in conversations.items():
            if conv_id == 'no-id':
                continue
                
            timestamps = [self.extract_timestamp_from_id(conv_id)]
            roles = Counter(msg.get('role', 'unknown') for msg in msgs)
            total_content_length = sum(len(json.dumps(msg.get('content', ''), default=str)) for msg in msgs)
            
            # Get sample content
            sample_content = msgs[0].get('content', '') if msgs else ''
            if isinstance(sample_content, str):
                sample_preview = sample_content[:100]
            else:
                sample_preview = json.dumps(sample_content, default=str)[:100]
            
            conversation_analysis[conv_id] = {
                'message_count': len(msgs),
                'timestamp': timestamps[0],
                'roles': dict(roles),
                'total_content_length': total_content_length,
                'sample_content': sample_preview,
                'duplicate_count': len(msgs)
            }
        
        return conversation_analysis
    
    def generate_enhanced_report(self, result: MigrationResult, conversation_analysis: Dict[str, Any]) -> str:
        """Generate enhanced analysis report with detailed insights"""
        report = ["Enhanced Migration Test & Analysis Report", "=" * 60, ""]
        
        # Migration Results
        report.append("🧪 MIGRATION ALGORITHM TEST RESULTS")
        report.append("-" * 45)
        report.append(f"Original message count: {result.original_count:,}")
        report.append(f"After deduplication: {result.deduplicated_count:,}")
        report.append(f"Final count (after limit): {result.final_count:,}")
        report.append(f"Duplicates removed: {result.duplicates_removed:,}")
        report.append(f"Old messages trimmed: {result.old_messages_removed:,}")
        report.append(f"Size reduction: {((result.original_count - result.final_count) / result.original_count * 100):.1f}%")
        report.append("")
        
        # Longest Message Analysis
        if result.longest_message:
            longest_content = result.longest_message.get('content', '')
            if isinstance(longest_content, str):
                content_preview = longest_content[:500]
            else:
                content_preview = json.dumps(longest_content, default=str)[:500]
            
            longest_size = len(json.dumps(result.longest_message, default=str))
            report.append("📏 LONGEST MESSAGE ANALYSIS")
            report.append("-" * 35)
            report.append(f"Size: {longest_size:,} characters")
            report.append(f"Role: {result.longest_message.get('role', 'unknown')}")
            report.append(f"Conversation ID: {result.longest_message.get('conversationId', 'none')}")
            report.append(f"Content preview (first 500 chars):")
            report.append(f"  {content_preview}")
            report.append("")
        
        # Unique Conversation IDs Analysis
        report.append("🔍 UNIQUE CONVERSATION IDs ANALYSIS")
        report.append("-" * 40)
        report.append(f"Total unique conversation IDs: {len(conversation_analysis)}")
        report.append("")
        
        # Sort conversations by timestamp for chronological view
        sorted_conversations = sorted(
            conversation_analysis.items(),
            key=lambda x: x[1]['timestamp']
        )
        
        report.append("📊 CONVERSATION ID DETAILS (chronological order)")
        report.append("-" * 55)
        report.append(f"{'Conversation ID':<30} {'Count':<6} {'Roles':<20} {'Sample Content'}")
        report.append("-" * 100)
        
        for conv_id, details in sorted_conversations[:20]:  # Show first 20
            roles_str = ', '.join(f"{role}:{count}" for role, count in details['roles'].items())
            sample = details['sample_content'][:40]
            report.append(f"{conv_id:<30} {details['duplicate_count']:<6} {roles_str:<20} {sample}")
        
        if len(sorted_conversations) > 20:
            report.append(f"... and {len(sorted_conversations) - 20} more conversation IDs")
        
        report.append("")
        
        # Most Duplicated Conversations
        most_duplicated = sorted(
            conversation_analysis.items(),
            key=lambda x: x[1]['duplicate_count'],
            reverse=True
        )
        
        report.append("🎯 MOST DUPLICATED CONVERSATIONS")
        report.append("-" * 35)
        for conv_id, details in most_duplicated[:10]:
            report.append(f"{conv_id}: {details['duplicate_count']} duplicates")
            report.append(f"  Sample: {details['sample_content'][:80]}")
            report.append("")
        
        # Timeline Analysis
        timestamps = [details['timestamp'] for details in conversation_analysis.values() if details['timestamp'] > 0]
        if timestamps:
            timestamps.sort()
            duration_ms = timestamps[-1] - timestamps[0] if len(timestamps) > 1 else 0
            duration_minutes = duration_ms / 1000 / 60
            
            report.append("⏱️  TIMELINE ANALYSIS")
            report.append("-" * 20)
            report.append(f"Conversation span: {duration_minutes:.1f} minutes")
            report.append(f"First message: {timestamps[0]} ({self.format_timestamp(timestamps[0])})")
            report.append(f"Last message: {timestamps[-1]} ({self.format_timestamp(timestamps[-1])})")
            report.append("")
        
        return "\n".join(report)
    
    def format_timestamp(self, timestamp: int) -> str:
        """Format timestamp for human readability"""
        import datetime
        try:
            dt = datetime.datetime.fromtimestamp(timestamp / 1000)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except:
            return "Invalid timestamp"
    
    def save_final_conversation(self, final_messages: List[Dict[str, Any]]):
        """Save the final conversation after migration for inspection"""
        print("💾 Saving final conversation after migration...")
        
        os.makedirs("migration_test_output", exist_ok=True)
        
        # Save full final conversation
        with open("migration_test_output/final_conversation.json", 'w') as f:
            json.dump(final_messages, f, indent=2, default=str)
        
        # Save readable conversation format
        readable_conversation = []
        for i, msg in enumerate(final_messages):
            content = msg.get('content', '')
            if isinstance(content, str):
                content_str = content
            else:
                content_str = json.dumps(content, default=str)
            
            readable_conversation.append({
                'index': i,
                'role': msg.get('role', 'unknown'),
                'conversationId': msg.get('conversationId', 'none'),
                'timestamp': self.extract_timestamp_from_id(msg.get('conversationId', '')),
                'content_length': len(content_str),
                'content_preview': content_str[:200]
            })
        
        with open("migration_test_output/final_conversation_readable.json", 'w') as f:
            json.dump(readable_conversation, f, indent=2, default=str)
        
        print(f"   Final conversation saved: {len(final_messages)} messages")
        print(f"   Files: migration_test_output/final_conversation.json")
        print(f"         migration_test_output/final_conversation_readable.json")

def main():
    # Check if we have the conversation messages
    conversation_file = "debug_output/conversationMessages_new.json"
    
    if not os.path.exists(conversation_file):
        print("❌ Conversation messages file not found!")
        print("   Please run: python state_analyzer.py errorfile.json")
        print("   This will generate the required debug files.")
        return
    
    print("🚀 Starting enhanced migration test and analysis...")
    print(f"📁 Loading conversation data from: {conversation_file}")
    
    try:
        with open(conversation_file, 'r') as f:
            messages = json.load(f)
        
        print(f"📄 Loaded {len(messages)} conversation messages")
        
        tester = MigrationTester()
        
        # Analyze unique conversations before migration
        conversation_analysis = tester.analyze_unique_conversations(messages)
        
        # Apply migration algorithm
        result = tester.apply_migration_algorithm(messages)
        
        # Generate enhanced report
        report = tester.generate_enhanced_report(result, conversation_analysis)
        
        # Save report
        report_file = "migration_test_report.txt"
        with open(report_file, 'w') as f:
            f.write(report)
        
        # Save final conversation
        tester.save_final_conversation(result.final_messages)
        
        print(f"📊 Enhanced analysis saved to: {report_file}")
        
        # Print key findings to console
        print("\n" + "="*70)
        print("🎯 KEY MIGRATION TEST RESULTS")
        print("="*70)
        print(f"✅ Original messages: {result.original_count:,}")
        print(f"✅ After deduplication: {result.deduplicated_count:,}")
        print(f"✅ Final count: {result.final_count:,}")
        print(f"🗑️  Duplicates removed: {result.duplicates_removed:,}")
        print(f"🗑️  Old messages trimmed: {result.old_messages_removed:,}")
        
        size_reduction = ((result.original_count - result.final_count) / result.original_count * 100)
        print(f"📉 Size reduction: {size_reduction:.1f}%")
        
        if result.longest_message:
            longest_size = len(json.dumps(result.longest_message, default=str))
            print(f"📏 Longest message: {longest_size:,} chars ({result.longest_message.get('role', 'unknown')})")
        
        print(f"🆔 Unique conversation IDs: {len(conversation_analysis)}")
        
        print(f"\n📋 Full analysis: {report_file}")
        print(f"📁 Final conversation: migration_test_output/")
        
    except Exception as e:
        print(f"❌ Error during migration test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
