export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature (minor version bump)
        'fix',      // Bug fix (patch version bump)
        'docs',     // Documentation only changes
        'style',    // Code style changes (formatting, semicolons, etc.)
        'refactor', // Code refactoring without feature/fix
        'perf',     // Performance improvements
        'test',     // Adding or updating tests
        'build',    // Build system or external dependencies
        'ci',       // CI/CD configuration changes
        'chore',    // Other changes (maintenance)
        'revert',   // Revert previous commit
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 200],
    'body-leading-blank': [1, 'always'],
    'body-max-line-length': [2, 'always', 400],
    'footer-leading-blank': [1, 'always'],
    'footer-max-line-length': [2, 'always', 400],
  },
};
