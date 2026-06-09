#!/usr/bin/env python3
"""
State Analyzer for SimpleGeneratorAgent setState debugging

This script parses error messages from setState failures and analyzes:
1. Size of each state property when serialized
2. Differences between old and new states
3. Main contributors to state growth
4. Detailed breakdown for debugging SQL storage issues

Usage: python state_analyzer.py <error_file_path>
"""

import json
import sys
import re
import os
from typing import Dict, Any, List, Tuple, Union
from dataclasses import dataclass
from collections import defaultdict
import difflib


@dataclass
class PropertyAnalysis:
    """Analysis results for a single property"""
    name: str
    old_size: int
    new_size: int
    old_serialized_length: int
    new_serialized_length: int
    growth_bytes: int
    growth_chars: int
    has_changed: bool
    old_type: str
    new_type: str


@dataclass
class StateAnalysis:
    """Complete analysis of state comparison"""
    total_old_size: int
    total_new_size: int
    total_old_serialized_length: int
    total_new_serialized_length: int
    total_growth_bytes: int
    total_growth_chars: int
    property_analyses: List[PropertyAnalysis]
    top_contributors: List[PropertyAnalysis]
    new_properties: List[str]
    removed_properties: List[str]
    changed_properties: List[str]


class StateAnalyzer:
    """Main analyzer class for state debugging"""
    
    def __init__(self):
        self.known_large_properties = {
            'generatedFilesMap', 'templateDetails', 'conversationMessages', 
            'generatedPhases', 'blueprint', 'commandsHistory'
        }
    
    def extract_states_from_error(self, error_content: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Extract original and new states from WebSocket error message"""
        print("🔍 Extracting states from WebSocket error message...")
        
        # First, try to parse as WebSocket JSON message
        websocket_message = None
        try:
            websocket_message = json.loads(error_content)
            print("✅ Successfully parsed WebSocket message")
        except json.JSONDecodeError:
            print("⚠️  Not a JSON WebSocket message, trying as plain text...")
        
        # Extract the error text
        if websocket_message and isinstance(websocket_message, dict):
            # Handle WebSocket message format: {"type": "error", "error": "..."}
            if 'error' in websocket_message:
                error_text = websocket_message['error']
                print(f"📄 Extracted error text from WebSocket message: {len(error_text):,} chars")
            else:
                # Maybe the whole message is the error text
                error_text = str(websocket_message)
                print(f"📄 Using whole WebSocket message as error text: {len(error_text):,} chars")
        else:
            # Use the raw content as error text
            error_text = error_content
            print(f"📄 Using raw content as error text: {len(error_text):,} chars")
        
        # Now extract states from the error text
        # Error format: "Error setting state: <error>; Original state: <json>; New state: <json>"
        
        # Find the original state JSON - more robust pattern matching
        original_match = re.search(r'Original state:\s*(\{.*?);\s*New state:', error_text, re.DOTALL)
        if not original_match:
            # Try without the semicolon requirement
            original_match = re.search(r'Original state:\s*(\{.*?)(?=New state:)', error_text, re.DOTALL)
        
        # Find the new state JSON - match to end or to next semicolon
        new_match = re.search(r'New state:\s*(\{.*?)(?:$|\s*$)', error_text, re.DOTALL)
        if not new_match:
            # Try more flexible pattern
            new_match = re.search(r'New state:\s*(\{.*)', error_text, re.DOTALL)
        
        if not original_match or not new_match:
            # Print some debug info to help diagnose
            print("❌ Could not find state patterns in error text")
            print(f"📝 Error text sample (first 500 chars):")
            print(error_text[:500])
            print(f"📝 Error text sample (last 500 chars):")
            print(error_text[-500:])
            
            # Look for any occurrence of "Original state:" and "New state:"
            orig_pos = error_text.find("Original state:")
            new_pos = error_text.find("New state:")
            print(f"📍 'Original state:' found at position: {orig_pos}")
            print(f"📍 'New state:' found at position: {new_pos}")
            
            if orig_pos >= 0:
                print(f"📝 Context around 'Original state:': {error_text[max(0, orig_pos-50):orig_pos+100]}")
            if new_pos >= 0:
                print(f"📝 Context around 'New state:': {error_text[max(0, new_pos-50):new_pos+100]}")
            
            raise ValueError("Could not extract state objects from error message. Expected format: 'Original state: {...}; New state: {...}'")
        
        original_json = original_match.group(1).strip()
        new_json = new_match.group(1).strip()
        
        print(f"📏 Extracted original state JSON length: {len(original_json):,} chars")
        print(f"📏 Extracted new state JSON length: {len(new_json):,} chars")
        
        # Clean up the JSON strings - remove any trailing content that's not part of JSON
        original_json = self.clean_json_string(original_json)
        new_json = self.clean_json_string(new_json)
        
        try:
            original_state = json.loads(original_json)
            print("✅ Successfully parsed original state")
        except json.JSONDecodeError as e:
            print(f"❌ Error parsing original state JSON: {e}")
            print(f"📝 First 200 chars: {original_json[:200]}...")
            print(f"📝 Last 200 chars: ...{original_json[-200:]}")
            raise
        
        try:
            new_state = json.loads(new_json)
            print("✅ Successfully parsed new state")
        except json.JSONDecodeError as e:
            print(f"❌ Error parsing new state JSON: {e}")
            print(f"📝 First 200 chars: {new_json[:200]}...")
            print(f"📝 Last 200 chars: ...{new_json[-200:]}")
            raise
        
        return original_state, new_state
    
    def clean_json_string(self, json_str: str) -> str:
        """Clean up JSON string by removing trailing non-JSON content"""
        # Find the last closing brace that matches the first opening brace
        brace_count = 0
        last_valid_pos = -1
        
        for i, char in enumerate(json_str):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    last_valid_pos = i + 1
                    break
        
        if last_valid_pos > 0:
            cleaned = json_str[:last_valid_pos]
            if len(cleaned) != len(json_str):
                print(f"🧹 Cleaned JSON string: {len(json_str)} → {len(cleaned)} chars")
            return cleaned
        
        return json_str
    
    def get_object_size_estimate(self, obj: Any) -> int:
        """Estimate memory size of an object in bytes"""
        if obj is None:
            return 0
        elif isinstance(obj, bool):
            return 1
        elif isinstance(obj, int):
            return 8
        elif isinstance(obj, float):
            return 8
        elif isinstance(obj, str):
            return len(obj.encode('utf-8'))
        elif isinstance(obj, (list, tuple)):
            return sum(self.get_object_size_estimate(item) for item in obj) + 8
        elif isinstance(obj, dict):
            return sum(
                self.get_object_size_estimate(k) + self.get_object_size_estimate(v) 
                for k, v in obj.items()
            ) + 8
        else:
            # For other types, estimate based on string representation
            return len(str(obj).encode('utf-8'))
    
    def get_serialized_length(self, obj: Any) -> int:
        """Get the length of JSON-serialized object"""
        try:
            return len(json.dumps(obj, default=str))
        except Exception:
            return len(str(obj))
    
    def get_type_description(self, obj: Any) -> str:
        """Get detailed type description of object"""
        if obj is None:
            return "null"
        elif isinstance(obj, bool):
            return "boolean"
        elif isinstance(obj, int):
            return "integer"
        elif isinstance(obj, float):
            return "float"
        elif isinstance(obj, str):
            return f"string({len(obj)})"
        elif isinstance(obj, list):
            return f"array({len(obj)})"
        elif isinstance(obj, dict):
            return f"object({len(obj)} keys)"
        else:
            return str(type(obj).__name__)
    
    def analyze_property(self, prop_name: str, old_value: Any, new_value: Any) -> PropertyAnalysis:
        """Analyze a single property comparison"""
        old_size = self.get_object_size_estimate(old_value)
        new_size = self.get_object_size_estimate(new_value)
        old_serialized = self.get_serialized_length(old_value)
        new_serialized = self.get_serialized_length(new_value)
        
        has_changed = old_value != new_value
        
        return PropertyAnalysis(
            name=prop_name,
            old_size=old_size,
            new_size=new_size,
            old_serialized_length=old_serialized,
            new_serialized_length=new_serialized,
            growth_bytes=new_size - old_size,
            growth_chars=new_serialized - old_serialized,
            has_changed=has_changed,
            old_type=self.get_type_description(old_value),
            new_type=self.get_type_description(new_value)
        )
    
    def analyze_states(self, original_state: Dict[str, Any], new_state: Dict[str, Any]) -> StateAnalysis:
        """Perform comprehensive analysis of state comparison"""
        print("\n🔬 Analyzing state differences...")
        
        # Get all properties from both states
        all_props = set(original_state.keys()) | set(new_state.keys())
        property_analyses = []
        
        # Analyze each property
        for prop_name in all_props:
            old_value = original_state.get(prop_name)
            new_value = new_state.get(prop_name)
            
            analysis = self.analyze_property(prop_name, old_value, new_value)
            property_analyses.append(analysis)
        
        # Calculate totals
        total_old_size = sum(p.old_size for p in property_analyses)
        total_new_size = sum(p.new_size for p in property_analyses)
        total_old_serialized = sum(p.old_serialized_length for p in property_analyses)
        total_new_serialized = sum(p.new_serialized_length for p in property_analyses)
        
        # Find top contributors (by serialized length growth)
        top_contributors = sorted(
            [p for p in property_analyses if p.growth_chars > 0],
            key=lambda p: p.growth_chars,
            reverse=True
        )[:10]
        
        # Categorize changes
        new_properties = [p.name for p in property_analyses if p.name not in original_state]
        removed_properties = [p.name for p in property_analyses if p.name not in new_state]
        changed_properties = [p.name for p in property_analyses if p.has_changed and p.name in original_state and p.name in new_state]
        
        return StateAnalysis(
            total_old_size=total_old_size,
            total_new_size=total_new_size,
            total_old_serialized_length=total_old_serialized,
            total_new_serialized_length=total_new_serialized,
            total_growth_bytes=total_new_size - total_old_size,
            total_growth_chars=total_new_serialized - total_old_serialized,
            property_analyses=property_analyses,
            top_contributors=top_contributors,
            new_properties=new_properties,
            removed_properties=removed_properties,
            changed_properties=changed_properties
        )
    
    def analyze_specific_property(self, prop_name: str, old_value: Any, new_value: Any) -> str:
        """Detailed analysis of a specific property that changed significantly"""
        report = [f"\n🔍 Detailed Analysis of '{prop_name}'"]
        report.append("=" * 60)
        
        if isinstance(old_value, dict) and isinstance(new_value, dict):
            # Analyze dictionary changes
            old_keys = set(old_value.keys())
            new_keys = set(new_value.keys())
            
            added_keys = new_keys - old_keys
            removed_keys = old_keys - new_keys
            common_keys = old_keys & new_keys
            
            if added_keys:
                report.append(f"➕ Added keys ({len(added_keys)}): {list(added_keys)[:10]}...")
                for key in list(added_keys)[:5]:
                    size = self.get_serialized_length(new_value[key])
                    report.append(f"   - {key}: {size:,} chars")
            
            if removed_keys:
                report.append(f"➖ Removed keys ({len(removed_keys)}): {list(removed_keys)[:10]}...")
            
            if common_keys:
                changed_common = []
                for key in common_keys:
                    if old_value[key] != new_value[key]:
                        old_size = self.get_serialized_length(old_value[key])
                        new_size = self.get_serialized_length(new_value[key])
                        growth = new_size - old_size
                        changed_common.append((key, growth, new_size))
                
                if changed_common:
                    changed_common.sort(key=lambda x: x[1], reverse=True)
                    report.append(f"📝 Changed existing keys (top 10):")
                    for key, growth, new_size in changed_common[:10]:
                        report.append(f"   - {key}: +{growth:,} chars (total: {new_size:,})")
        
        elif isinstance(old_value, list) and isinstance(new_value, list):
            # Analyze list changes
            report.append(f"📊 List size change: {len(old_value)} → {len(new_value)} items")
            if len(new_value) > len(old_value):
                added_items = len(new_value) - len(old_value)
                if added_items > 0 and len(new_value) > 0:
                    avg_item_size = self.get_serialized_length(new_value[-1]) if new_value else 0
                    report.append(f"   Average size of new items: ~{avg_item_size:,} chars")
        
        return "\n".join(report)
    
    def generate_report(self, analysis: StateAnalysis, original_state: Dict[str, Any], new_state: Dict[str, Any]) -> str:
        """Generate comprehensive analysis report"""
        report = ["State Size Analysis Report", "=" * 50, ""]
        
        # Executive Summary
        report.append("📊 EXECUTIVE SUMMARY")
        report.append("-" * 30)
        report.append(f"Total serialized size growth: {analysis.total_growth_chars:,} characters")
        report.append(f"Memory size growth estimate: {analysis.total_growth_bytes:,} bytes")
        report.append(f"Growth percentage: {(analysis.total_growth_chars / analysis.total_old_serialized_length * 100):.1f}%")
        report.append(f"New total serialized size: {analysis.total_new_serialized_length:,} characters")
        report.append("")
        
        # Quick Stats
        report.append("📈 QUICK STATS")
        report.append("-" * 20)
        report.append(f"Properties changed: {len(analysis.changed_properties)}")
        report.append(f"Properties added: {len(analysis.new_properties)}")
        report.append(f"Properties removed: {len(analysis.removed_properties)}")
        report.append("")
        
        # Top Contributors
        report.append("🎯 TOP CONTRIBUTORS TO SIZE GROWTH")
        report.append("-" * 40)
        for i, prop in enumerate(analysis.top_contributors, 1):
            percentage = (prop.growth_chars / analysis.total_growth_chars * 100) if analysis.total_growth_chars > 0 else 0
            report.append(f"{i:2d}. {prop.name}")
            report.append(f"    Growth: +{prop.growth_chars:,} chars ({percentage:.1f}%)")
            report.append(f"    New size: {prop.new_serialized_length:,} chars")
            report.append(f"    Type: {prop.old_type} → {prop.new_type}")
            report.append("")
        
        # All Properties Summary
        report.append("📋 ALL PROPERTIES SUMMARY")
        report.append("-" * 30)
        report.append(f"{'Property':<25} {'Old Size':<12} {'New Size':<12} {'Growth':<12} {'Changed':<8}")
        report.append("-" * 75)
        
        # Sort by new size (largest first)
        sorted_props = sorted(analysis.property_analyses, key=lambda p: p.new_serialized_length, reverse=True)
        
        for prop in sorted_props:
            growth_str = f"+{prop.growth_chars:,}" if prop.growth_chars > 0 else str(prop.growth_chars)
            changed_str = "Yes" if prop.has_changed else "No"
            report.append(f"{prop.name[:24]:<25} {prop.old_serialized_length:>11,} {prop.new_serialized_length:>11,} {growth_str:>11} {changed_str:<8}")
        
        report.append("")
        
        # Detailed Analysis for Top Contributors
        report.append("🔬 DETAILED ANALYSIS OF TOP CONTRIBUTORS")
        report.append("-" * 50)
        
        for prop in analysis.top_contributors[:5]:  # Top 5 only
            if prop.growth_chars > 1000:  # Only for significant growth
                old_value = original_state.get(prop.name)
                new_value = new_state.get(prop.name)
                detailed = self.analyze_specific_property(prop.name, old_value, new_value)
                report.append(detailed)
                report.append("")
        
        # Recommendations
        report.append("💡 RECOMMENDATIONS")
        report.append("-" * 20)
        
        largest_prop = analysis.top_contributors[0] if analysis.top_contributors else None
        if largest_prop and largest_prop.growth_chars > 10000:
            report.append(f"🚨 CRITICAL: '{largest_prop.name}' grew by {largest_prop.growth_chars:,} chars")
            report.append("   Consider implementing size limits or cleanup mechanisms")
            report.append("")
        
        if analysis.total_new_serialized_length > 1000000:  # 1MB
            report.append("⚠️  WARNING: Total state size exceeds 1MB when serialized")
            report.append("   This may cause database storage issues")
            report.append("")
        
        # Check for known problematic patterns
        for prop in analysis.property_analyses:
            if prop.name in self.known_large_properties and prop.new_serialized_length > 100000:
                report.append(f"🔍 '{prop.name}' is unusually large ({prop.new_serialized_length:,} chars)")
                if prop.name == 'generatedFilesMap':
                    report.append("   Consider implementing file content compression or chunking")
                elif prop.name == 'conversationMessages':
                    report.append("   Consider implementing message history limits")
                elif prop.name == 'commandsHistory':
                    report.append("   Consider cleaning up old command history")
                report.append("")
        
        return "\n".join(report)
    
    def save_debug_files(self, original_state: Dict[str, Any], new_state: Dict[str, Any], analysis: StateAnalysis):
        """Save debug files for further analysis"""
        print("💾 Saving debug files...")
        
        # Save individual property files for large contributors
        os.makedirs("debug_output", exist_ok=True)
        
        for prop in analysis.top_contributors[:3]:
            if prop.growth_chars > 1000:
                prop_name_safe = re.sub(r'[^\w\-_]', '_', prop.name)
                
                # Save old value
                old_value = original_state.get(prop.name)
                if old_value:
                    with open(f"debug_output/{prop_name_safe}_old.json", 'w') as f:
                        json.dump(old_value, f, indent=2, default=str)
                
                # Save new value
                new_value = new_state.get(prop.name)
                if new_value:
                    with open(f"debug_output/{prop_name_safe}_new.json", 'w') as f:
                        json.dump(new_value, f, indent=2, default=str)
                
                print(f"   Saved {prop.name} debug files")
        
        # Save full states
        with open("debug_output/original_state_full.json", 'w') as f:
            json.dump(original_state, f, indent=2, default=str)
        
        with open("debug_output/new_state_full.json", 'w') as f:
            json.dump(new_state, f, indent=2, default=str)
        
        print("✅ Debug files saved to debug_output/ directory")


def main():
    if len(sys.argv) != 2:
        print("Usage: python state_analyzer.py <error_file_path>")
        print("\nThis script analyzes setState error dumps to identify size issues.")
        print("The error file should contain the WebSocket error message with original and new states.")
        sys.exit(1)
    
    error_file_path = sys.argv[1]
    
    if not os.path.exists(error_file_path):
        print(f"❌ Error file not found: {error_file_path}")
        sys.exit(1)
    
    print(f"🚀 Starting state analysis of: {error_file_path}")
    print(f"📁 File size: {os.path.getsize(error_file_path):,} bytes")
    print()
    
    analyzer = StateAnalyzer()
    
    try:
        # Read the error file
        with open(error_file_path, 'r', encoding='utf-8') as f:
            error_content = f.read()
        
        print(f"📄 Read {len(error_content):,} characters from error file")
        
        # Extract states
        original_state, new_state = analyzer.extract_states_from_error(error_content)
        
        # Perform analysis
        analysis = analyzer.analyze_states(original_state, new_state)
        
        # Generate report
        report = analyzer.generate_report(analysis, original_state, new_state)
        
        # Save report
        report_file = error_file_path.replace('.json', '_analysis.txt').replace('.txt', '_analysis.txt')
        with open(report_file, 'w') as f:
            f.write(report)
        
        print(f"📊 Analysis report saved to: {report_file}")
        
        # Save debug files
        analyzer.save_debug_files(original_state, new_state, analysis)
        
        # Print summary to console
        print("\n" + "="*60)
        print("ANALYSIS SUMMARY")
        print("="*60)
        print(f"Total growth: {analysis.total_growth_chars:,} characters")
        print(f"Largest contributor: {analysis.top_contributors[0].name if analysis.top_contributors else 'None'}")
        if analysis.top_contributors:
            top = analysis.top_contributors[0]
            percentage = (top.growth_chars / analysis.total_growth_chars * 100) if analysis.total_growth_chars > 0 else 0
            print(f"   Growth: +{top.growth_chars:,} chars ({percentage:.1f}%)")
        
        print(f"\n📋 Full report available in: {report_file}")
        print("📁 Debug files available in: debug_output/")
        
    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
