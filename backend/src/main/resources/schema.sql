CREATE TABLE IF NOT EXISTS syncwatch_users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    username_normalized VARCHAR(32) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL,
    email_normalized VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS google_drive_connections (
    user_id VARCHAR(36) PRIMARY KEY,
    encrypted_refresh_token VARCHAR(4096) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_google_drive_user
        FOREIGN KEY (user_id) REFERENCES syncwatch_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS remember_me_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_remember_me_user
        FOREIGN KEY (user_id) REFERENCES syncwatch_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_remember_me_user
    ON remember_me_tokens(user_id);
