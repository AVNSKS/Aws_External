CREATE DATABASE IF NOT EXISTS devsecops_dashboard;
USE devsecops_dashboard;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role ENUM('Admin', 'Manager', 'Staff') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_username (username)
);

CREATE TABLE IF NOT EXISTS operational_records (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  team_name VARCHAR(120) NOT NULL,
  task_name VARCHAR(200) NOT NULL,
  status ENUM('pending', 'completed', 'blocked') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operational_records_user_id (user_id),
  CONSTRAINT fk_operational_records_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);