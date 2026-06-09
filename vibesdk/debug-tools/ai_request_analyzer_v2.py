#!/usr/bin/env python3
"""
AI Request Analyzer v2.0 - Enhanced Type-Safe Phase Implementation Analysis

This comprehensive, type-safe analyzer examines AI inference requests from the 
PhaseImplementation operation with proper SCOF format parsing and strict adherence 
to DRY principles.

Features:
- Type-safe data structures with proper validation
- Accurate SCOF format parsing with file extraction
- Dependencies list analysis with package breakdown
- Blueprint schema parsing with section details
- Template variable tracking and overhead calculation
- Cross-message duplication detection
- Compression potential estimation with precise calculations

Usage:
    python ai_request_analyzer_v2.py path/to/sample-request.json --detailed
"""

import json
import sys
import re
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Tuple, Union, TypedDict, Protocol
from pathlib import Path
import argparse
from collections import defaultdict, Counter
import math
from enum import Enum
from abc import ABC, abstractmethod


class ContentType(Enum):
    """Enumeration for content types."""
    SOURCE_CODE = "source_code"
    JSON_DATA = "json_data" 
    MARKDOWN_STRUCTURED = "markdown_structured"
    LARGE_TEXT = "large_text"
    METADATA = "metadata"
    PROSE = "prose"


class ComponentName(Enum):
    """Enumeration for component names."""
    ROLE_SECTION = "role_section"
    GOAL_SECTION = "goal_section"
    CONTEXT_SECTION = "context_section"
    CLIENT_REQUEST = "client_request"
    BLUEPRINT = "blueprint"
    DEPENDENCIES = "dependencies"
    UI_GUIDELINES = "ui_guidelines"
    STRATEGY = "strategy"
    TEMPLATE_DETAILS = "template_details"
    PROJECT_CONTEXT = "project_context"
    COMPLETED_PHASES = "completed_phases"
    CODEBASE = "codebase"
    RUNTIME_ERRORS = "runtime_errors"
    CURRENT_PHASE = "current_phase"
    INSTRUCTIONS = "instructions"
    COMMON_PITFALLS = "common_pitfalls"
    REACT_PREVENTION = "react_prevention"
    OUTPUT_FORMAT = "output_format"


@dataclass(frozen=True)
class SCOFFile:
    """Type-safe representation of a file in SCOF format."""
    path: str
    purpose: str
    content: str
    content_size: int
    format_type: str  # 'full_content' or 'unified_diff'
    
    def __post_init__(self):
        """Validate file data."""
        if not self.path:
            raise ValueError("File path cannot be empty")
        if self.content_size != len(self.content):
            raise ValueError("Content size mismatch")
    
    @property
    def purpose_preview(self) -> str:
        """Get first 50 chars of purpose."""
        return self.purpose[:50] + "..." if len(self.purpose) > 50 else self.purpose
    
    @property
    def content_preview(self) -> str:
        """Get first 50 chars of content."""
        content_clean = self.content.strip()[:50]
        return content_clean + "..." if len(self.content) > 50 else content_clean
    
    @property
    def file_extension(self) -> str:
        """Get file extension."""
        return Path(self.path).suffix.lower()
    
    @property
    def is_test_file(self) -> bool:
        """Check if this is a test file."""
        test_patterns = ['test', 'spec', '.test.', '.spec.', '__tests__', 'example', 'demo', 'sample', '.stories.', 'mock']
        return any(pattern in self.path.lower() for pattern in test_patterns)


@dataclass(frozen=True)
class Dependency:
    """Type-safe representation of a package dependency."""
    name: str
    version: str
    category: str  # 'runtime', 'dev', 'peer'
    
    def __post_init__(self):
        """Validate dependency data."""
        if not self.name or not self.version:
            raise ValueError("Dependency name and version are required")
    
    @property
    def is_dev_dependency(self) -> bool:
        """Check if this is a dev dependency."""
        dev_indicators = ['@types/', 'eslint', 'typescript', 'vite', '@vitejs/', 'autoprefixer', 'postcss', 'globals']
        return any(indicator in self.name for indicator in dev_indicators)
    
    @property
    def size_estimate(self) -> int:
        """Estimate package size contribution in chars."""
        return len(f'"{self.name}":"{self.version}",')


@dataclass(frozen=True)
class PromptComponent:
    """Type-safe representation of a prompt component."""
    name: ComponentName
    content: str
    start_marker: str
    end_marker: str
    size_chars: int
    content_type: ContentType
    
    def __post_init__(self):
        """Validate component data."""
        if self.size_chars != len(self.content):
            raise ValueError("Size mismatch in PromptComponent")
    
    @property
    def size_tokens_approx(self) -> int:
        """Approximate token count."""
        return math.ceil(self.size_chars / 4)
    
    @property
    def percentage_of_request(self) -> float:
        """Percentage of total request (set externally)."""
        return 0.0  # Will be calculated by analyzer


@dataclass
class MessageAnalysis:
    """Type-safe analysis of a single message."""
    role: str
    content: str
    size_chars: int
    size_tokens_approx: int
    components: List[PromptComponent] = field(default_factory=list)
    
    def __post_init__(self):
        """Validate message data."""
        if self.size_chars != len(self.content):
            raise ValueError("Size mismatch in MessageAnalysis")
        
    def add_component(self, component: PromptComponent) -> None:
        """Add a component to this message."""
        self.components.append(component)


@dataclass
class SCOFAnalysis:
    """Comprehensive SCOF format analysis."""
    files: List[SCOFFile]
    total_files: int
    total_content_size: int
    total_metadata_overhead: int
    file_type_distribution: Dict[str, int]
    test_files: List[SCOFFile]
    
    def __post_init__(self):
        """Validate SCOF analysis."""
        if self.total_files != len(self.files):
            raise ValueError("File count mismatch")
    
    @property
    def overhead_percentage(self) -> float:
        """Calculate SCOF overhead as percentage."""
        return (self.total_metadata_overhead / max(self.total_content_size, 1)) * 100
    
    @property
    def filterable_files_count(self) -> int:
        """Count of files that can be filtered out."""
        return len(self.test_files)
    
    @property
    def filterable_size_savings(self) -> int:
        """Estimated size savings from filtering test files."""
        return sum(f.content_size + 50 for f in self.test_files)  # +50 for SCOF overhead per file


@dataclass
class DependencyAnalysis:
    """Analysis of project dependencies."""
    dependencies: List[Dependency]
    total_count: int
    total_serialized_size: int  # Just the JSON object size
    dev_dependencies: List[Dependency]
    runtime_dependencies: List[Dependency]
    full_component_size: int = 0  # Full component including all text
    blueprint_dependencies_text: str = ""  # The blueprint.frameworks text
    
    def __post_init__(self):
        """Validate dependency analysis."""
        if self.total_count != len(self.dependencies):
            raise ValueError("Dependency count mismatch")
    
    @property
    def dev_dependency_overhead(self) -> int:
        """Size of dev dependencies that could be excluded."""
        return sum(dep.size_estimate for dep in self.dev_dependencies)
    
    @property
    def optimization_potential(self) -> float:
        """Potential size reduction percentage."""
        return (self.dev_dependency_overhead / max(self.total_serialized_size, 1)) * 100
    
    @property
    def template_bloat(self) -> int:
        """Size of template text vs actual data."""
        return self.full_component_size - self.total_serialized_size - len(self.blueprint_dependencies_text)
    
    @property
    def bloat_percentage(self) -> float:
        """Percentage of component that is template bloat."""
        return (self.template_bloat / max(self.full_component_size, 1)) * 100


@dataclass
class TemplateAnalysis:
    """Analysis of template serialization efficiency."""
    template_variables: List[str]
    substitution_overhead: int
    markdown_sections: int
    markdown_overhead: int
    unused_sections: List[str]
    total_template_size: int
    
    @property
    def efficiency_score(self) -> float:
        """Calculate template efficiency score (0-100)."""
        total_overhead = self.substitution_overhead + self.markdown_overhead
        return max(0, 100 - (total_overhead / max(self.total_template_size, 1) * 100))


class BaseAnalyzer(ABC):
    """Abstract base class for analyzers to ensure consistent interface."""
    
    @abstractmethod
    def analyze(self, content: str) -> Any:
        """Analyze content and return results."""
        pass


class SCOFParser(BaseAnalyzer):
    """Type-safe SCOF format parser."""
    
    SCOF_FILE_PATTERN = re.compile(
        r'# Creating new file: ([^\n]+)\n'
        r'# File Purpose: ([^\n]*(?:\n# [^\n]*)*)\n*'
        r'cat > [^\n]+ << \'EOF\'\n'
        r'(.*?)\n'
        r'EOF',
        re.DOTALL | re.MULTILINE
    )
    
    SCOF_DIFF_PATTERN = re.compile(
        r'# Applying diff to file: ([^\n]+)\n'
        r'# File Purpose: ([^\n]*(?:\n# [^\n]*)*)\n*'
        r'cat << \'EOF\' \| patch [^\n]+\n'
        r'(.*?)\n'
        r'EOF',
        re.DOTALL | re.MULTILINE
    )
    
    def analyze(self, content: str) -> SCOFAnalysis:
        """Parse SCOF content and extract files."""
        files = []
        
        # Parse full content files
        for match in self.SCOF_FILE_PATTERN.finditer(content):
            file_path, purpose_raw, file_content = match.groups()
            purpose = self._clean_purpose(purpose_raw)
            
            scof_file = SCOFFile(
                path=file_path.strip(),
                purpose=purpose,
                content=file_content,
                content_size=len(file_content),
                format_type='full_content'
            )
            files.append(scof_file)
        
        # Parse diff files
        for match in self.SCOF_DIFF_PATTERN.finditer(content):
            file_path, purpose_raw, diff_content = match.groups()
            purpose = self._clean_purpose(purpose_raw)
            
            scof_file = SCOFFile(
                path=file_path.strip(),
                purpose=purpose,
                content=diff_content,
                content_size=len(diff_content),
                format_type='unified_diff'
            )
            files.append(scof_file)
        
        return self._build_analysis(files, content)
    
    def _clean_purpose(self, purpose_raw: str) -> str:
        """Clean purpose text from SCOF comments."""
        return re.sub(r'\n# ', ' ', purpose_raw).strip()
    
    def _build_analysis(self, files: List[SCOFFile], content: str) -> SCOFAnalysis:
        """Build comprehensive SCOF analysis."""
        file_type_dist = defaultdict(int)
        test_files = []
        total_content_size = 0
        total_metadata_overhead = 0
        
        for file in files:
            file_type_dist[file.file_extension] += 1
            total_content_size += file.content_size
            
            if file.is_test_file:
                test_files.append(file)
            
            # Calculate SCOF metadata overhead
            metadata_size = len(f"# Creating new file: {file.path}\n# File Purpose: {file.purpose}\n\ncat > {file.path} << 'EOF'\nEOF\n\n")
            total_metadata_overhead += metadata_size
        
        return SCOFAnalysis(
            files=files,
            total_files=len(files),
            total_content_size=total_content_size,
            total_metadata_overhead=total_metadata_overhead,
            file_type_distribution=dict(file_type_dist),
            test_files=test_files
        )


class DependencyParser(BaseAnalyzer):
    """Type-safe dependency parser."""
    
    def analyze(self, content: str) -> DependencyAnalysis:
        """Parse dependencies from the full component content."""
        # Find the JSON dependencies object
        json_match = re.search(r'\{("[^"]+":"[^"]+",?\s*)+\}', content)
        if not json_match:
            return self._empty_analysis()
        
        try:
            deps_json = json.loads(json_match.group(0))
        except json.JSONDecodeError:
            return self._empty_analysis()
        
        dependencies = []
        dev_deps = []
        runtime_deps = []
        
        for name, version in deps_json.items():
            dep = Dependency(name=name, version=version, category='runtime')
            dependencies.append(dep)
            
            if dep.is_dev_dependency:
                dev_deps.append(dep)
            else:
                runtime_deps.append(dep)
        
        # JSON object size (the actual dependencies data)
        json_size = len(json_match.group(0))
        
        # Find blueprint dependencies (comma-separated frameworks)
        blueprint_deps_match = re.search(r'additional dependencies/frameworks.*?provided:\s*([^\n]+)', content, re.DOTALL)
        blueprint_deps_text = blueprint_deps_match.group(1).strip() if blueprint_deps_match else ""
        
        return DependencyAnalysis(
            dependencies=dependencies,
            total_count=len(dependencies),
            total_serialized_size=json_size,  # Just the JSON object size
            dev_dependencies=dev_deps,
            runtime_dependencies=runtime_deps,
            full_component_size=len(content),  # Full component size
            blueprint_dependencies_text=blueprint_deps_text
        )
    
    def _empty_analysis(self) -> DependencyAnalysis:
        """Return empty dependency analysis."""
        return DependencyAnalysis(
            dependencies=[],
            total_count=0,
            total_serialized_size=0,
            dev_dependencies=[],
            runtime_dependencies=[],
            full_component_size=0,
            blueprint_dependencies_text=""
        )


class TemplateParser(BaseAnalyzer):
    """Type-safe template analysis parser."""
    
    TEMPLATE_VAR_PATTERN = re.compile(r'\{\{(\w+)\}\}')
    MARKDOWN_SECTION_PATTERN = re.compile(r'^#{2,6}\s+(.+)$', re.MULTILINE)
    
    def analyze(self, content: str) -> TemplateAnalysis:
        """Analyze template usage and efficiency."""
        # Find template variables
        template_vars = list(set(self.TEMPLATE_VAR_PATTERN.findall(content)))
        
        # Count markdown sections
        markdown_sections = len(self.MARKDOWN_SECTION_PATTERN.findall(content))
        
        # Calculate overheads
        substitution_overhead = len(template_vars) * 20  # Estimated overhead per variable
        markdown_overhead = markdown_sections * 50  # Estimated overhead per section
        
        # Detect unused sections (simplified heuristic)
        unused_sections = []
        if 'placeholder' in content.lower() or 'example' in content.lower():
            unused_sections.append('example_content')
        
        return TemplateAnalysis(
            template_variables=template_vars,
            substitution_overhead=substitution_overhead,
            markdown_sections=markdown_sections,
            markdown_overhead=markdown_overhead,
            unused_sections=unused_sections,
            total_template_size=len(content)
        )


@dataclass
class OptimizationRecommendation:
    """Type-safe optimization recommendation."""
    title: str
    description: str
    estimated_savings_chars: int
    estimated_savings_percentage: float
    implementation_difficulty: str  # 'easy', 'medium', 'hard'
    code_location: Optional[str] = None
    
    @property
    def estimated_savings_tokens(self) -> int:
        """Estimated token savings."""
        return math.ceil(self.estimated_savings_chars / 4)


@dataclass
class RequestAnalysis:
    """Complete type-safe request analysis."""
    model: str
    total_size_chars: int
    total_size_tokens_approx: int
    total_messages: int
    messages: List[MessageAnalysis]
    scof_analysis: Optional[SCOFAnalysis] = None
    dependency_analysis: Optional[DependencyAnalysis] = None  
    template_analysis: Optional[TemplateAnalysis] = None
    recommendations: List[OptimizationRecommendation] = field(default_factory=list)
    
    def __post_init__(self):
        """Validate request analysis."""
        if self.total_messages != len(self.messages):
            raise ValueError("Message count mismatch")
        if self.total_size_chars != sum(msg.size_chars for msg in self.messages):
            raise ValueError("Total size mismatch")


class PhaseImplementationAnalyzer:
    """Main type-safe analyzer for Phase Implementation requests."""
    
    def __init__(self):
        self.scof_parser = SCOFParser()
        self.dependency_parser = DependencyParser()
        self.template_parser = TemplateParser()
        
        self.prompt_patterns = self._get_prompt_patterns()
    
    def _get_prompt_patterns(self) -> Dict[ComponentName, Tuple[str, str]]:
        """Get prompt component patterns."""
        return {
            ComponentName.ROLE_SECTION: ('<ROLE>', '</ROLE>'),
            ComponentName.GOAL_SECTION: ('<GOAL>', '</GOAL>'),
            ComponentName.CONTEXT_SECTION: ('<CONTEXT>', '</CONTEXT>'),
            ComponentName.CLIENT_REQUEST: ('<CLIENT REQUEST>', '</CLIENT REQUEST>'),
            ComponentName.BLUEPRINT: ('<BLUEPRINT>', '</BLUEPRINT>'),
            # Use more specific pattern for DEPENDENCIES to avoid matching references
            ComponentName.DEPENDENCIES: ('<DEPENDENCIES>\n**Available Dependencies:**', '</DEPENDENCIES>'),
            ComponentName.STRATEGY: ('<PHASES GENERATION STRATEGY>', '</PHASES GENERATION STRATEGY>'),
            ComponentName.PROJECT_CONTEXT: ('<PROJECT CONTEXT>', '</PROJECT CONTEXT>'),
            ComponentName.COMPLETED_PHASES: ('<COMPLETED PHASES>', '</COMPLETED PHASES>'),
            ComponentName.CODEBASE: ('<CODEBASE>', '</CODEBASE>'),
            ComponentName.CURRENT_PHASE: ('<CURRENT_PHASE>', '</CURRENT_PHASE>'),
            ComponentName.INSTRUCTIONS: ('<INSTRUCTIONS & CODE QUALITY STANDARDS>', '</INSTRUCTIONS & CODE QUALITY STANDARDS>'),
        }
    
    def analyze_request(self, json_path: str) -> RequestAnalysis:
        """Analyze AI request with full type safety."""
        print(f"🔍 Analyzing AI request: {json_path}")
        
        with open(json_path, 'r', encoding='utf-8') as f:
            request_data = json.load(f)
        
        messages = []
        total_size = 0
        
        # Analyze each message
        for msg_data in request_data.get('messages', []):
            content = msg_data.get('content', '')
            size_chars = len(content)
            total_size += size_chars
            
            message_analysis = MessageAnalysis(
                role=msg_data.get('role', 'unknown'),
                content=content,
                size_chars=size_chars,
                size_tokens_approx=math.ceil(size_chars / 4)
            )
            
            # Extract components
            components = self._extract_components(content, total_size)
            for component in components:
                message_analysis.add_component(component)
                
            messages.append(message_analysis)
        
        # Create base analysis
        analysis = RequestAnalysis(
            model=request_data.get('model', 'unknown'),
            total_size_chars=total_size,
            total_size_tokens_approx=math.ceil(total_size / 4),
            total_messages=len(messages),
            messages=messages
        )
        
        # Enhanced analysis
        print("🔬 Running enhanced analysis...")
        print("   📡 File fetching mechanism: sandboxSdkClient.getFiles() reads .important_files.json")
        analysis.scof_analysis = self._analyze_scof(analysis)
        analysis.dependency_analysis = self._analyze_dependencies(analysis)  
        analysis.template_analysis = self._analyze_templates(analysis)
        analysis.recommendations = self._generate_recommendations(analysis)
        
        return analysis
    
    def _extract_components(self, content: str, total_size: int) -> List[PromptComponent]:
        """Extract components from message content."""
        components = []
        
        for component_name, (start_marker, end_marker) in self.prompt_patterns.items():
            pattern = re.escape(start_marker) + r'(.*?)' + re.escape(end_marker)
            matches = re.finditer(pattern, content, re.DOTALL)
            
            for match in matches:
                component_content = match.group(1).strip()
                content_type = self._classify_content_type(component_content)
                
                
                component = PromptComponent(
                    name=component_name,
                    content=component_content,
                    start_marker=start_marker,
                    end_marker=end_marker,
                    size_chars=len(component_content),
                    content_type=content_type
                )
                components.append(component)
        
        return components
    
    def _classify_content_type(self, content: str) -> ContentType:
        """Classify content type."""
        content_lower = content.lower()
        
        if content.count('"') > 10 and ':' in content:
            return ContentType.JSON_DATA
        elif re.search(r'^#{2,6}', content, re.MULTILINE):
            return ContentType.MARKDOWN_STRUCTURED
        elif 'import' in content_lower and ('export' in content_lower or 'function' in content_lower):
            return ContentType.SOURCE_CODE
        elif content.count('\n') > 50:
            return ContentType.LARGE_TEXT
        elif len(content) < 100:
            return ContentType.METADATA
        else:
            return ContentType.PROSE
    
    def _find_component_content(self, analysis: RequestAnalysis, component_name: ComponentName) -> str:
        """DRY helper: Find content of a specific component across all messages."""
        for message in analysis.messages:
            for component in message.components:
                if component.name == component_name:
                    return component.content
        return ""
    
    def _analyze_scof(self, analysis: RequestAnalysis) -> Optional[SCOFAnalysis]:
        """Analyze SCOF format in the request."""
        print("   📁 Analyzing SCOF format...")
        
        codebase_content = self._find_component_content(analysis, ComponentName.CODEBASE)
        if codebase_content:
            return self.scof_parser.analyze(codebase_content)
        return None
    
    def _analyze_dependencies(self, analysis: RequestAnalysis) -> Optional[DependencyAnalysis]:
        """Analyze dependencies in the request."""
        print("   📦 Analyzing dependencies...")
        
        deps_content = self._find_component_content(analysis, ComponentName.DEPENDENCIES)
        if deps_content:
            return self.dependency_parser.analyze(deps_content)
        return None
    
    def _analyze_templates(self, analysis: RequestAnalysis) -> Optional[TemplateAnalysis]:
        """Analyze template usage."""
        print("   🏗️ Analyzing templates...")
        
        # Combine all content for template analysis
        all_content = " ".join(msg.content for msg in analysis.messages)
        return self.template_parser.analyze(all_content)
    
    def _generate_recommendations(self, analysis: RequestAnalysis) -> List[OptimizationRecommendation]:
        """Generate type-safe optimization recommendations."""
        print("   💡 Generating recommendations...")
        
        recommendations = []
        
        # Critical size warning
        if analysis.total_size_chars > 200_000:
            recommendations.append(OptimizationRecommendation(
                title="Critical Size Reduction",
                description=f"Request size ({analysis.total_size_chars:,} chars) exceeds optimal LLM limits",
                estimated_savings_chars=analysis.total_size_chars - 150_000,
                estimated_savings_percentage=((analysis.total_size_chars - 150_000) / analysis.total_size_chars) * 100,
                implementation_difficulty="medium"
            ))
        
        # SCOF optimizations
        if analysis.scof_analysis:
            scof = analysis.scof_analysis
            if scof.filterable_files_count > 0:
                recommendations.append(OptimizationRecommendation(
                    title="SCOF File Filtering",
                    description=f"Remove {scof.filterable_files_count} test/demo files from codebase serialization",
                    estimated_savings_chars=scof.filterable_size_savings,
                    estimated_savings_percentage=(scof.filterable_size_savings / analysis.total_size_chars) * 100,
                    implementation_difficulty="easy",
                    code_location="worker/agents/operations/common.ts:getSystemPromptWithProjectContext()"
                ))
        
        # Dependency optimizations
        if analysis.dependency_analysis:
            deps = analysis.dependency_analysis
            if deps.optimization_potential > 10:
                recommendations.append(OptimizationRecommendation(
                    title="Dependency List Optimization",
                    description=f"Exclude dev dependencies from prompt context",
                    estimated_savings_chars=deps.dev_dependency_overhead,
                    estimated_savings_percentage=deps.optimization_potential,
                    implementation_difficulty="easy",
                    code_location="worker/agents/prompts.ts:PROMPT_UTILS.serializeTemplate()"
                ))
        
        # Template optimizations
        if analysis.template_analysis:
            template = analysis.template_analysis
            if template.efficiency_score < 70:
                savings = int(template.total_template_size * 0.2)  # Conservative 20% reduction
                recommendations.append(OptimizationRecommendation(
                    title="Template Serialization Optimization", 
                    description="Optimize markdown schema serialization and remove unused sections",
                    estimated_savings_chars=savings,
                    estimated_savings_percentage=(savings / analysis.total_size_chars) * 100,
                    implementation_difficulty="medium",
                    code_location="worker/agents/inferutils/schemaFormatters.ts:TemplateRegistry.markdown.serialize()"
                ))
        
        return recommendations
    
    def _print_component_breakdown_table(self, analysis: RequestAnalysis) -> None:
        """Print detailed table of all prompt components with accurate sizes."""
        # Collect all components from all messages
        all_components = []
        for msg_idx, message in enumerate(analysis.messages):
            for component in message.components:
                all_components.append((msg_idx, message.role, component))
        
        # Sort by size (descending)
        all_components.sort(key=lambda x: x[2].size_chars, reverse=True)
        
        # Print table header
        print(f"   {'Section':<25} {'Message':<8} {'Size':<10} {'%':<6} {'Type':<12} {'Description':<50}")
        print("   " + "-" * 111)
        
        # Print all components
        for msg_idx, msg_role, component in all_components:
            percentage = (component.size_chars / analysis.total_size_chars) * 100
            section_name = component.name.value.replace('_', ' ').title()
            description = self._get_component_description_short(component.name)
            
            print(f"   {section_name[:24]:<25} {msg_role:<8} {component.size_chars:>8,} {percentage:>5.1f}% {component.content_type.value:<12} {description[:49]:<50}")
        
        # Calculate non-overlapping total by handling nested components
        total_non_overlapping = self._calculate_non_overlapping_total(all_components, analysis)
        unidentified = analysis.total_size_chars - total_non_overlapping
        
        print("   " + "-" * 111)
        print(f"   {'NON-OVERLAPPING TOTAL':<25} {'ALL':<8} {total_non_overlapping:>8,} {(total_non_overlapping/analysis.total_size_chars)*100:>5.1f}% {'MIXED':<12} {'Adjusted for nested components':<50}")
        if unidentified > 0:
            print(f"   {'UNIDENTIFIED/OTHER':<25} {'ALL':<8} {unidentified:>8,} {(unidentified/analysis.total_size_chars)*100:>5.1f}% {'UNKNOWN':<12} {'Headers, formatting, assistant messages':<50}")
        elif unidentified < 0:
            print(f"   {'NOTE: NESTED OVERLAP':<25} {'ALL':<8} {abs(unidentified):>8,} {'chars'} {'WARNING':<12} {'Some components are nested within others':<50}")
        
        # Show component-specific breakdowns for complex sections
        self._print_special_component_breakdowns(analysis)
    
    def _get_component_description_short(self, component_name: ComponentName) -> str:
        """Get short description for component."""
        descriptions = {
            ComponentName.ROLE_SECTION: 'Agent role and identity',
            ComponentName.GOAL_SECTION: 'Primary objectives', 
            ComponentName.CONTEXT_SECTION: 'Operational constraints',
            ComponentName.CLIENT_REQUEST: 'Original user query',
            ComponentName.BLUEPRINT: 'Project specifications',
            ComponentName.DEPENDENCIES: 'Available packages',
            ComponentName.STRATEGY: 'Development approach',
            ComponentName.PROJECT_CONTEXT: 'Current project state',
            ComponentName.COMPLETED_PHASES: 'Previous phases',
            ComponentName.CODEBASE: 'Source code files (SCOF)',
            ComponentName.CURRENT_PHASE: 'Phase to implement',
            ComponentName.INSTRUCTIONS: 'Code quality standards',
        }
        return descriptions.get(component_name, component_name.value)
    
    def _calculate_non_overlapping_total(self, all_components: List, analysis: RequestAnalysis) -> int:
        """Calculate total size avoiding double-counting nested components."""
        
        # Known nested relationships based on prompt structure:
        # PROJECT_CONTEXT contains COMPLETED_PHASES and CODEBASE
        nested_components = {
            ComponentName.PROJECT_CONTEXT: [ComponentName.COMPLETED_PHASES, ComponentName.CODEBASE]
        }
        
        total = 0
        parent_components = set()
        nested_in_parent = set()
        
        # First, identify parent components and their nested children
        for _, _, component in all_components:
            if component.name in nested_components:
                parent_components.add(component.name)
                for nested_name in nested_components[component.name]:
                    nested_in_parent.add(nested_name)
        
        # Sum non-nested components + parent components (which include nested content)
        for _, _, component in all_components:
            if component.name in parent_components:
                # Include parent component (it contains the nested ones)
                total += component.size_chars
            elif component.name not in nested_in_parent:
                # Include non-nested component
                total += component.size_chars
            # Skip nested components to avoid double counting
        
        return total
    
    def _print_special_component_breakdowns(self, analysis: RequestAnalysis) -> None:
        """Print detailed breakdowns for complex components."""
        
        # Dependencies breakdown
        if analysis.dependency_analysis:
            deps = analysis.dependency_analysis
            print(f"\n   📦 DEPENDENCIES COMPONENT BREAKDOWN ({deps.full_component_size:,} chars):")
            print(f"      JSON object (84 packages): {deps.total_serialized_size:,} chars ({(deps.total_serialized_size/deps.full_component_size)*100:.1f}%)")
            print(f"      Blueprint frameworks: {len(deps.blueprint_dependencies_text):,} chars ({(len(deps.blueprint_dependencies_text)/deps.full_component_size)*100:.1f}%)")
            print(f"      Headers/formatting: {deps.template_bloat:,} chars ({deps.bloat_percentage:.1f}%)")
            print(f"      └─ Dev dependencies removable: {deps.dev_dependency_overhead:,} chars ({deps.optimization_potential:.1f}% of JSON)")
        
        # SCOF breakdown  
        if analysis.scof_analysis:
            scof = analysis.scof_analysis
            print(f"\n   📁 CODEBASE COMPONENT BREAKDOWN (SCOF format):")
            print(f"      File content (40 files): {scof.total_content_size:,} chars ({(scof.total_content_size/(scof.total_content_size+scof.total_metadata_overhead))*100:.1f}%)")
            print(f"      SCOF metadata overhead: {scof.total_metadata_overhead:,} chars ({scof.overhead_percentage:.1f}%)")
            print(f"      └─ Test files removable: {scof.filterable_size_savings:,} chars ({len(scof.test_files)} file)")
    
    def print_detailed_analysis(self, analysis: RequestAnalysis) -> None:
        """Print comprehensive analysis results."""
        print("\n" + "=" * 80)
        print("🔬 AI REQUEST ANALYSIS - Type-Safe & SCOF-Accurate")
        print("=" * 80)
        
        # First show comprehensive component breakdown table
        print(f"\n📊 COMPLETE PROMPT SECTIONS BREAKDOWN:")
        self._print_component_breakdown_table(analysis)
        
        # Then show file list from SCOF
        if analysis.scof_analysis:
            print(f"\n📄 COMPLETE FILE LIST FROM SCOF DUMP:")
            print(f"   {'#':<3} {'File Path':<40} {'Size':<8} {'Type':<6} {'Test?':<6} {'Purpose (truncated)'}")
            print("   " + "-" * 100)
            
            for i, file in enumerate(analysis.scof_analysis.files, 1):
                is_test = "YES" if file.is_test_file else "NO"
                file_type = file.file_extension or "none"
                print(f"   {i:<3} {file.path[:39]:<40} {file.content_size:>6,} {file_type:<6} {is_test:<6} {file.purpose_preview}")
                
            print(f"\n   Total files: {len(analysis.scof_analysis.files)}")
            print(f"   Test files (filterable): {len([f for f in analysis.scof_analysis.files if f.is_test_file])}")
            print(f"   Total content size: {sum(f.content_size for f in analysis.scof_analysis.files):,} chars")
            print(f"   SCOF metadata overhead: {analysis.scof_analysis.total_metadata_overhead:,} chars")
        
        # Overview
        print(f"\n📋 REQUEST OVERVIEW:")
        print(f"   Model: {analysis.model}")
        print(f"   Total Size: {analysis.total_size_chars:,} characters")
        print(f"   Token Estimate: ~{analysis.total_size_tokens_approx:,} tokens")
        print(f"   Messages: {analysis.total_messages}")
        
        # Message breakdown
        print(f"\n📨 MESSAGE BREAKDOWN:")
        for i, message in enumerate(analysis.messages):
            print(f"   Message {i+1} ({message.role:>9}): {message.size_chars:>8,} chars ({message.size_tokens_approx:>6,} tokens)")
            for component in sorted(message.components, key=lambda x: x.size_chars, reverse=True)[:2]:
                print(f"      ↳ {component.name.value}: {component.size_chars:,} chars")
        
        # SCOF Analysis
        if analysis.scof_analysis:
            print(f"\n📁 SCOF FORMAT ANALYSIS:")
            scof = analysis.scof_analysis
            print(f"   Total files: {scof.total_files}")
            print(f"   Content size: {scof.total_content_size:,} chars")
            print(f"   Metadata overhead: {scof.total_metadata_overhead:,} chars ({scof.overhead_percentage:.1f}%)")
            print(f"   Test/filterable files: {scof.filterable_files_count}")
            print(f"   Potential savings: {scof.filterable_size_savings:,} chars")
            
            if scof.files:
                print(f"\n   📄 FILES BREAKDOWN:")
                print(f"   {'File Path':<30} {'Purpose (50 chars)':<52} {'Content (50 chars)':<52} {'Size':<8}")
                print("   " + "-" * 142)
                
                for file in sorted(scof.files, key=lambda f: f.content_size, reverse=True)[:10]:
                    print(f"   {file.path[:29]:<30} {file.purpose_preview:<52} {file.content_preview:<52} {file.content_size:>6,}")
        
        # Dependencies Analysis
        if analysis.dependency_analysis:
            print(f"\n📦 DEPENDENCIES ANALYSIS (CORRECTED):")
            deps = analysis.dependency_analysis
            
            print(f"   Total dependencies: {deps.total_count}")
            print(f"   Runtime dependencies: {len(deps.runtime_dependencies)}")
            print(f"   Dev dependencies: {len(deps.dev_dependencies)}")
            print(f"   JSON object size: {deps.total_serialized_size:,} chars (actual data)")
            print(f"   Full component size: {deps.full_component_size:,} chars")
            print(f"   Blueprint dependencies: '{deps.blueprint_dependencies_text}' ({len(deps.blueprint_dependencies_text)} chars)")
            print(f"   Template bloat: {deps.template_bloat:,} chars ({deps.bloat_percentage:.1f}% of component)")
            print(f"   Dev dependency overhead: {deps.dev_dependency_overhead:,} chars ({deps.optimization_potential:.1f}% of JSON)")
            
            print(f"\n   📋 TOP DEPENDENCIES BY SIZE:")
            sorted_deps = sorted(deps.dependencies, key=lambda d: d.size_estimate, reverse=True)
            for dep in sorted_deps[:10]:
                dep_type = "DEV" if dep.is_dev_dependency else "RUN"
                print(f"   {dep.name:<40} {dep.version:<12} {dep_type:<4} {dep.size_estimate:>4} chars")
        
        # Template Analysis
        if analysis.template_analysis:
            print(f"\n🏗️ TEMPLATE ANALYSIS:")
            template = analysis.template_analysis
            print(f"   Template variables: {len(template.template_variables)}")
            print(f"   Markdown sections: {template.markdown_sections}")
            print(f"   Efficiency score: {template.efficiency_score:.1f}%")
            print(f"   Total template size: {template.total_template_size:,} chars")
            print(f"   Overhead: {template.substitution_overhead + template.markdown_overhead:,} chars")
            
            if template.template_variables:
                print(f"   Variables: {', '.join(template.template_variables[:10])}{'...' if len(template.template_variables) > 10 else ''}")
        
        # Recommendations
        if analysis.recommendations:
            print(f"\n💡 OPTIMIZATION RECOMMENDATIONS:")
            total_potential_savings = sum(r.estimated_savings_chars for r in analysis.recommendations)
            print(f"   Total potential savings: {total_potential_savings:,} chars ({(total_potential_savings/analysis.total_size_chars)*100:.1f}%)")
            print()
            
            for i, rec in enumerate(analysis.recommendations, 1):
                print(f"   {i}. {rec.title}")
                print(f"      Description: {rec.description}")
                print(f"      Savings: {rec.estimated_savings_chars:,} chars ({rec.estimated_savings_percentage:.1f}%)")
                print(f"      Difficulty: {rec.implementation_difficulty}")
                if rec.code_location:
                    print(f"      Location: {rec.code_location}")
                print()


def main():
    """Main CLI entry point with proper error handling."""
    parser = argparse.ArgumentParser(
        description="Type-safe AI Gateway request analyzer for PhaseImplementation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ai_request_analyzer_v2.py sample-request.json --detailed
  python ai_request_analyzer_v2.py sample-request.json --export analysis.json
        """
    )
    
    parser.add_argument('request_file', help='Path to the JSON request file')
    parser.add_argument('--detailed', '-d', action='store_true', 
                       help='Print detailed analysis')
    parser.add_argument('--export', '-e', help='Export analysis to JSON file')
    
    args = parser.parse_args()
    
    # Validate input
    if not Path(args.request_file).exists():
        print(f"❌ Error: Request file not found: {args.request_file}")
        sys.exit(1)
    
    try:
        # Run analysis
        analyzer = PhaseImplementationAnalyzer()
        analysis = analyzer.analyze_request(args.request_file)
        
        # Print results
        if args.detailed:
            analyzer.print_detailed_analysis(analysis)
        else:
            print(f"\n📊 ANALYSIS SUMMARY:")
            print(f"   Request size: {analysis.total_size_chars:,} chars")
            print(f"   SCOF files: {analysis.scof_analysis.total_files if analysis.scof_analysis else 0}")
            print(f"   Dependencies: {analysis.dependency_analysis.total_count if analysis.dependency_analysis else 0}")
            print(f"   Optimization opportunities: {len(analysis.recommendations)}")
            
            if analysis.recommendations:
                print(f"\n💡 TOP RECOMMENDATIONS:")
                for rec in analysis.recommendations[:3]:
                    print(f"   • {rec.title}: {rec.estimated_savings_chars:,} chars")
        
        # Export if requested
        if args.export:
            export_data = {
                'overview': {
                    'model': analysis.model,
                    'total_size_chars': analysis.total_size_chars,
                    'total_messages': analysis.total_messages
                },
                'scof_analysis': {
                    'total_files': analysis.scof_analysis.total_files if analysis.scof_analysis else 0,
                    'files': [{'path': f.path, 'size': f.content_size} for f in analysis.scof_analysis.files] if analysis.scof_analysis else []
                } if analysis.scof_analysis else None,
                'recommendations': [
                    {
                        'title': r.title,
                        'savings_chars': r.estimated_savings_chars,
                        'difficulty': r.implementation_difficulty
                    } for r in analysis.recommendations
                ]
            }
            
            with open(args.export, 'w') as f:
                json.dump(export_data, f, indent=2)
            print(f"\n💾 Analysis exported to: {args.export}")
        
        print(f"\n✅ Analysis complete!")
        
    except Exception as e:
        print(f"❌ Analysis failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()