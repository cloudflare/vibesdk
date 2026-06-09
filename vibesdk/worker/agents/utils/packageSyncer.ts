/**
 * Compare two dependency objects
 * Checks if both have the same packages with the same versions
 */
function dependenciesEqual(obj1: Record<string, string>, obj2: Record<string, string>): boolean {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    // Different number of packages
    if (keys1.length !== keys2.length) return false;
    
    // Check each package exists in both with same version
    return keys1.every(key => obj2[key] === obj1[key]);
}

/**
 * Merges sandbox package.json dependencies into agent's package.json
 * Only updates dependencies and devDependencies, preserving all other fields
 * 
 * @param oldPackageJson - Agent's current package.json (from state)
 * @param newPackageJson - Sandbox's package.json (after npm install/add/remove)
 * @returns Object with updated flag and merged package.json string
 */
export function updatePackageJson(
    oldPackageJson: string | undefined, 
    newPackageJson: string
): { updated: boolean; packageJson: string } {
    try {
        // First sync - use sandbox version entirely
        if (!oldPackageJson) {
            return { updated: true, packageJson: newPackageJson };
        }

        const oldPackage = JSON.parse(oldPackageJson);
        const newPackage = JSON.parse(newPackageJson);

        const oldDependencies = oldPackage.dependencies || {};
        const newDependencies = newPackage.dependencies || {};
        const oldDevDependencies = oldPackage.devDependencies || {};
        const newDevDependencies = newPackage.devDependencies || {};

        // Deep comparison to detect actual changes
        const dependenciesChanged = !dependenciesEqual(oldDependencies, newDependencies);
        const devDependenciesChanged = !dependenciesEqual(oldDevDependencies, newDevDependencies);

        if (dependenciesChanged || devDependenciesChanged) {
            // Merge: Update only dependencies, preserve everything else from agent's version
            oldPackage.dependencies = newDependencies;
            oldPackage.devDependencies = newDevDependencies;
            
            return { 
                updated: true, 
                packageJson: JSON.stringify(oldPackage, null, 2) // Pretty print with 2 space indent
            };
        }

        return { updated: false, packageJson: oldPackageJson };
    } catch (error) {
        console.error('Failed to parse package.json', error);
        // On parse error, use new version as fallback
        return { updated: true, packageJson: newPackageJson };
    }
}