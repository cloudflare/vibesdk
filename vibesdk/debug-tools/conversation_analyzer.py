#!/usr/bin/env python3
"""
Conversation Messages Analyzer

This script analyzes the conversationMessages property to understand
why it's so large and provide specific recommendations for cleanup.

Usage: python conversation_analyzer.py
"""

import json
import os
from typing import List, Dict, Any
from dataclasses import dataclass
from collections import Counter, defaultdict

@dataclass
class ConversationAnalysis:
    total_messages: int
    total_size: int
    avg_message_size: int
    message_types: Dict[str, int]
    largest_messages: List[Dict[str, Any]]
    size_by_type: Dict[str, int]
    recommendations: List[str]

class ConversationAnalyzer:
    def __init__(self):
        self.size_thresholds = {
            'small': 1000,      # 1KB
            'medium': 5000,     # 5KB  
            'large': 20000,     # 20KB
            'huge': 100000      # 100KB
        }
    
    def analyze_conversation_messages(self, messages: List[Dict[str, Any]]) -> ConversationAnalysis:
        """Analyze conversation messages for size and content"""
        print(f"🔍 Analyzing {len(messages)} conversation messages...")
        
        total_size = 0
        message_types = Counter()
        size_by_type = defaultdict(int)
        largest_messages = []
        
        for i, msg in enumerate(messages):
            # Calculate message size
            msg_size = len(json.dumps(msg, default=str))
            total_size += msg_size
            
            # Categorize by type/role
            msg_type = msg.get('role', msg.get('type', 'unknown'))
            message_types[msg_type] += 1
            size_by_type[msg_type] += msg_size
            
            # Track largest messages
            msg_info = {
                'index': i,
                'size': msg_size,
                'type': msg_type,
                'content_preview': str(msg.get('content', ''))[:100],
                'timestamp': msg.get('timestamp', 'unknown')
            }
            largest_messages.append(msg_info)
        
        # Sort by size for analysis
        largest_messages.sort(key=lambda x: x['size'], reverse=True)
        
        avg_size = total_size // len(messages) if messages else 0
        
        # Generate recommendations
        recommendations = self._generate_recommendations(
            messages, total_size, avg_size, message_types, largest_messages
        )
        
        return ConversationAnalysis(
            total_messages=len(messages),
            total_size=total_size,
            avg_message_size=avg_size,
            message_types=dict(message_types),
            largest_messages=largest_messages[:20],  # Top 20
            size_by_type=dict(size_by_type),
            recommendations=recommendations
        )
    
    def _generate_recommendations(self, messages, total_size, avg_size, message_types, largest_messages):
        recommendations = []
        
        # Size-based recommendations
        if total_size > 1000000:  # 1MB
            recommendations.append("🚨 CRITICAL: Conversation messages exceed 1MB - implement immediate cleanup")
            recommendations.append("   Implement a maximum message history limit (e.g., 50-100 messages)")
        
        if avg_size > 10000:  # 10KB average
            recommendations.append("⚠️  Average message size is very large - check for data bloat in messages")
        
        # Check for huge individual messages
        huge_messages = [m for m in largest_messages if m['size'] > self.size_thresholds['huge']]
        if huge_messages:
            recommendations.append(f"🔍 Found {len(huge_messages)} messages larger than 100KB each")
            recommendations.append("   Consider truncating or summarizing very long messages")
        
        # Type-based recommendations
        if 'assistant' in message_types and message_types['assistant'] > 100:
            recommendations.append("📝 High number of assistant messages - consider keeping only recent ones")
        
        if 'user' in message_types and message_types['user'] > 50:
            recommendations.append("👤 High number of user messages - implement conversation pruning")
        
        # Specific code recommendations
        total_messages = len(messages)
        if total_messages > 100:
            keep_recent = min(50, total_messages // 2)
            recommendations.append(f"💡 SUGGESTED FIX: Keep only the {keep_recent} most recent messages")
            recommendations.append("   Implementation: conversationMessages = conversationMessages.slice(-{keep_recent})")
        
        return recommendations
    
    def generate_report(self, analysis: ConversationAnalysis) -> str:
        """Generate detailed conversation analysis report"""
        report = ["Conversation Messages Analysis Report", "=" * 50, ""]
        
        # Summary
        report.append("📊 CONVERSATION SUMMARY")
        report.append("-" * 30)
        report.append(f"Total messages: {analysis.total_messages:,}")
        report.append(f"Total size: {analysis.total_size:,} characters ({analysis.total_size/1024:.1f} KB)")
        report.append(f"Average message size: {analysis.avg_message_size:,} characters")
        report.append("")
        
        # Message types breakdown
        report.append("📈 MESSAGE TYPES")
        report.append("-" * 20)
        for msg_type, count in sorted(analysis.message_types.items(), key=lambda x: x[1], reverse=True):
            percentage = (count / analysis.total_messages * 100)
            avg_size_type = analysis.size_by_type[msg_type] // count if count > 0 else 0
            report.append(f"{msg_type:>15}: {count:>4} messages ({percentage:4.1f}%) - avg {avg_size_type:,} chars each")
        report.append("")
        
        # Largest messages
        report.append("🎯 LARGEST MESSAGES (Top 20)")
        report.append("-" * 40)
        report.append(f"{'Index':>5} {'Size':>8} {'Type':>12} {'Preview'}")
        report.append("-" * 70)
        
        for msg in analysis.largest_messages[:20]:
            preview = msg['content_preview'].replace('\n', ' ')[:50]
            report.append(f"{msg['index']:>5} {msg['size']:>8} {msg['type']:>12} {preview}")
        report.append("")
        
        # Size distribution
        report.append("📊 SIZE DISTRIBUTION")
        report.append("-" * 25)
        size_buckets = {
            'tiny (<1KB)': 0,
            'small (1-5KB)': 0, 
            'medium (5-20KB)': 0,
            'large (20-100KB)': 0,
            'huge (>100KB)': 0
        }
        
        for msg in analysis.largest_messages:
            size = msg['size']
            if size < 1000:
                size_buckets['tiny (<1KB)'] += 1
            elif size < 5000:
                size_buckets['small (1-5KB)'] += 1
            elif size < 20000:
                size_buckets['medium (5-20KB)'] += 1
            elif size < 100000:
                size_buckets['large (20-100KB)'] += 1
            else:
                size_buckets['huge (>100KB)'] += 1
        
        for bucket, count in size_buckets.items():
            percentage = (count / analysis.total_messages * 100) if analysis.total_messages > 0 else 0
            report.append(f"{bucket:>20}: {count:>4} messages ({percentage:4.1f}%)")
        report.append("")
        
        # Recommendations
        report.append("💡 RECOMMENDATIONS")
        report.append("-" * 20)
        for rec in analysis.recommendations:
            report.append(rec)
        report.append("")
        
        # Code suggestions
        report.append("🔧 CODE IMPLEMENTATION SUGGESTIONS")
        report.append("-" * 40)
        if analysis.total_messages > 50:
            keep_messages = min(50, analysis.total_messages // 2)
            report.append("// Add this to your setState calls to limit conversation history:")
            report.append(f"const MAX_CONVERSATION_MESSAGES = {keep_messages};")
            report.append("if (conversationMessages.length > MAX_CONVERSATION_MESSAGES) {")
            report.append("    conversationMessages = conversationMessages.slice(-MAX_CONVERSATION_MESSAGES);")
            report.append("}")
            report.append("")
            
            # Calculate potential savings
            messages_to_remove = analysis.total_messages - keep_messages
            estimated_savings = (messages_to_remove / analysis.total_messages) * analysis.total_size
            report.append(f"// Estimated size reduction: ~{estimated_savings:,.0f} characters ({estimated_savings/1024:.1f}KB)")
        
        return "\n".join(report)

def main():
    # Check if we have debug files from the main analyzer
    conversation_file = "debug_output/conversationMessages_new.json"
    
    if not os.path.exists(conversation_file):
        print("❌ Conversation messages debug file not found!")
        print("   Please run the main state analyzer first: python state_analyzer.py errorfile.json")
        print("   This will generate the required debug files in debug_output/")
        return
    
    print("🚀 Starting conversation messages analysis...")
    print(f"📁 Reading conversation data from: {conversation_file}")
    
    try:
        with open(conversation_file, 'r') as f:
            messages = json.load(f)
        
        print(f"📄 Loaded {len(messages)} conversation messages")
        
        analyzer = ConversationAnalyzer()
        analysis = analyzer.analyze_conversation_messages(messages)
        
        # Generate report
        report = analyzer.generate_report(analysis)
        
        # Save report
        report_file = "conversation_analysis_report.txt"
        with open(report_file, 'w') as f:
            f.write(report)
        
        print(f"📊 Conversation analysis saved to: {report_file}")
        
        # Print key findings
        print("\n" + "="*60)
        print("KEY FINDINGS")
        print("="*60)
        print(f"Total messages: {analysis.total_messages:,}")
        print(f"Total size: {analysis.total_size:,} chars ({analysis.total_size/1024:.1f}KB)")
        print(f"Average per message: {analysis.avg_message_size:,} chars")
        
        if analysis.largest_messages:
            largest = analysis.largest_messages[0]
            print(f"Largest single message: {largest['size']:,} chars ({largest['type']})")
        
        print(f"\n💡 Top recommendation:")
        if analysis.recommendations:
            print(f"   {analysis.recommendations[0]}")
        
        print(f"\n📋 Full analysis available in: {report_file}")
        
    except Exception as e:
        print(f"❌ Error during conversation analysis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
