-- Zero Trust demo tables and seed data for PlanetScale/MySQL.
-- Apply after the base Users/Roles/UserRoles/Sessions/Devices schema exists.
-- PlanetScale recommends operating without database-enforced foreign key constraints
-- unless FK support is explicitly enabled. These tables keep indexed relationship
-- columns and let the application enforce referential behavior.

CREATE TABLE IF NOT EXISTS Resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  segment VARCHAR(64) NOT NULL,
  sensitivity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_resources_name (name)
);

CREATE TABLE IF NOT EXISTS AccessPolicies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  role_name VARCHAR(64) NOT NULL,
  segment VARCHAR(64) NOT NULL,
  resource_id INT NULL,
  require_mfa BOOLEAN NOT NULL DEFAULT TRUE,
  require_trusted_device BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_access_policies_name (name),
  KEY idx_access_policies_lookup (role_name, segment, active),
  KEY idx_access_policies_resource (resource_id)
);

CREATE TABLE IF NOT EXISTS AccessEvents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  category ENUM('auth', 'mfa', 'device', 'session', 'resource', 'admin', 'incident') NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  decision ENUM('allow', 'deny', 'info') NOT NULL DEFAULT 'info',
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  user_id INT NULL,
  session_id INT NULL,
  device_id INT NULL,
  resource_id INT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  message TEXT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_access_events_created (created_at),
  KEY idx_access_events_user (user_id, created_at),
  KEY idx_access_events_session (session_id, created_at),
  KEY idx_access_events_device (device_id, created_at),
  KEY idx_access_events_resource (resource_id, created_at),
  KEY idx_access_events_category (category, event_type, created_at),
  KEY idx_access_events_decision (decision, severity, created_at)
);

CREATE TABLE IF NOT EXISTS Incidents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  status ENUM('open', 'investigating', 'resolved', 'false_positive') NOT NULL DEFAULT 'open',
  related_user_id INT NULL,
  related_event_id BIGINT NULL,
  assignee VARCHAR(120) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_incidents_status (status, severity, updated_at),
  KEY idx_incidents_user (related_user_id, status),
  KEY idx_incidents_event (related_event_id)
);

INSERT INTO Resources (name, description, segment, sensitivity, active)
VALUES
  ('HR Portal', 'Employee self-service HR records and benefits.', 'Employee', 'medium', TRUE),
  ('Manager Reports', 'Team performance and staffing reports.', 'Management', 'medium', TRUE),
  ('Finance System', 'Financial records, invoices, and budget data.', 'Finance', 'high', TRUE),
  ('Engineering Repository', 'Source code and deployment artifacts.', 'Engineering', 'high', TRUE),
  ('Admin Console', 'Privileged identity and security administration.', 'Admin', 'critical', TRUE)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  segment = VALUES(segment),
  sensitivity = VALUES(sensitivity),
  active = VALUES(active);

INSERT INTO AccessPolicies (name, role_name, segment, require_mfa, require_trusted_device, active)
VALUES
  ('Employees can access employee resources with MFA', 'employee', 'Employee', TRUE, FALSE, TRUE),
  ('Managers can access management resources with MFA and trusted device', 'manager', 'Management', TRUE, TRUE, TRUE),
  ('Managers can access employee resources with MFA', 'manager', 'Employee', TRUE, FALSE, TRUE),
  ('Admins can access finance resources with MFA and trusted device', 'admin', 'Finance', TRUE, TRUE, TRUE),
  ('Admins can access engineering resources with MFA and trusted device', 'admin', 'Engineering', TRUE, TRUE, TRUE),
  ('Admins can access admin resources with MFA and trusted device', 'admin', 'Admin', TRUE, TRUE, TRUE),
  ('Admins can access employee resources with MFA', 'admin', 'Employee', TRUE, FALSE, TRUE),
  ('Admins can access management resources with MFA and trusted device', 'admin', 'Management', TRUE, TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  role_name = VALUES(role_name),
  segment = VALUES(segment),
  require_mfa = VALUES(require_mfa),
  require_trusted_device = VALUES(require_trusted_device),
  active = VALUES(active);
