-- vibe-db-optimizer-agent: MySQL initialization
-- Creates read-only optimizer user

CREATE USER IF NOT EXISTS 'optimizer_readonly'@'%' IDENTIFIED BY 'optimizer_readonly';
GRANT SELECT ON vibe_db.* TO 'optimizer_readonly'@'%';
FLUSH PRIVILEGES;
