-- Migration to replace deploymentUrl with deploymentId
-- For URLs like https://<deploymentId>.<subdomain>, extract the deploymentId

-- Step 1: Add the new deploymentId column
ALTER TABLE `apps` ADD COLUMN `deployment_id` TEXT;

-- Step 2: Update existing rows to populate deploymentId from deploymentUrl
-- Extract the substring between 'https://' and the first '.'
UPDATE `apps` 
SET `deployment_id` = CASE 
    WHEN `deployment_url` IS NOT NULL AND `deployment_url` != '' 
    THEN substr(
        `deployment_url`, 
        9,  -- Skip 'https://' (8 chars + 1)
        instr(substr(`deployment_url`, 9), '.') - 1  -- Find position of first '.' after 'https://'
    )
    ELSE NULL
END
WHERE `deployment_url` IS NOT NULL;

-- Step 3: Drop the old deploymentUrl column
ALTER TABLE `apps` DROP COLUMN `deployment_url`;
