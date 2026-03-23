-- ============================================================
--  BROADCAST RUNDOWN APP — SQLite Schema v2
--  Kolejność: respektuje klucze obce (FK najpierw tabela bazowa)
--  Konwencje:
--    • id         TEXT PRIMARY KEY  (UUID v4, generowany w aplikacji)
--    • timestamps TEXT              (ISO-8601: "2025-05-17T20:30:00.000Z")
--    • duration   INTEGER           (milisekundy dla Rundown-mode)
--    • frames     INTEGER           (klatki dla Timeline/CuePilot-mode)
--    • booleans   INTEGER           (0 / 1 — SQLite nie ma BOOLEAN)
--    • JSON pola  TEXT              (stringified JSON, walidacja w app)
--    • enums      TEXT              (z CHECK constraint)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;


-- ============================================================
--  POZIOM 0: USER
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,                 -- bcrypt
    avatar_url    TEXT,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- ============================================================
--  POZIOM 0: EVENT (folder organizacyjny)
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
    id          TEXT    PRIMARY KEY,
    owner_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name        TEXT    NOT NULL,
    slug        TEXT    NOT NULL UNIQUE,
    logo_url    TEXT,
    description TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_id);

-- Linki udostępnienia eventu gościom (read-only)
CREATE TABLE IF NOT EXISTS event_guests (
    id           TEXT    PRIMARY KEY,
    event_id     TEXT    NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    share_token  TEXT    NOT NULL UNIQUE,           -- losowy token w URL
    label        TEXT,                              -- np. "Link dla klienta"
    expires_at   TEXT,                              -- NULL = nie wygasa
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_event_guests_token ON event_guests(share_token);


-- ============================================================
--  POZIOM 1: PROJECT (CuePilot-style kontener)
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT    PRIMARY KEY,
    event_id    TEXT    REFERENCES events(id) ON DELETE SET NULL,
    owner_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name        TEXT    NOT NULL,
    slug        TEXT    NOT NULL UNIQUE,
    type        TEXT    NOT NULL DEFAULT 'SOLO'
                        CHECK(type IN ('SOLO','MINI','PRO','MAX')),
    status      TEXT    NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft','active','archived')),
    timezone    TEXT    NOT NULL DEFAULT 'Europe/Warsaw',
    default_fps INTEGER NOT NULL DEFAULT 25
                        CHECK(default_fps IN (24,25,29,30,50,60)),
    description TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_event   ON projects(event_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner   ON projects(owner_id);

-- Role użytkowników w projekcie
CREATE TABLE IF NOT EXISTS project_members (
    id         TEXT    PRIMARY KEY,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    role       TEXT    NOT NULL DEFAULT 'viewer'
                       CHECK(role IN ('owner','admin','editor','viewer')),
    invited_by TEXT    REFERENCES users(id) ON DELETE SET NULL,
    joined_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user    ON project_members(user_id);

-- Definicja kamer projektu (CuePilot: kamera nr 1–12, kolor, etykieta)
CREATE TABLE IF NOT EXISTS camera_presets (
    id              TEXT    PRIMARY KEY,
    project_id      TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number          INTEGER NOT NULL CHECK(number BETWEEN 1 AND 16),
    label           TEXT    NOT NULL DEFAULT '',   -- np. "Steadicam"
    color           TEXT    NOT NULL DEFAULT '#2196F3', -- hex kolor bloków
    default_channel TEXT    NOT NULL DEFAULT 'PGM'
                            CHECK(default_channel IN ('PGM','ME1','ME2','AUX1','AUX2','AUX3')),
    operator_name   TEXT,
    UNIQUE(project_id, number)
);

CREATE INDEX IF NOT EXISTS idx_camera_presets_project ON camera_presets(project_id);


-- ============================================================
--  POZIOM 2: RUNDOWN
-- ============================================================

CREATE TABLE IF NOT EXISTS rundowns (
    id          TEXT    PRIMARY KEY,
    project_id  TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_id    TEXT    REFERENCES events(id) ON DELETE SET NULL,
    name        TEXT    NOT NULL,
    show_date   TEXT,                              -- "2025-05-17"
    show_time   TEXT,                              -- "20:00:00"
    status      TEXT    NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft','approved','live','done')),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    venue       TEXT,
    default_fps INTEGER REFERENCES projects(id),   -- NULL = dziedziczy z project
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_rundowns_project ON rundowns(project_id);
CREATE INDEX IF NOT EXISTS idx_rundowns_event   ON rundowns(event_id);


-- ============================================================
--  POZIOM 2: KOLUMNY RUNDOWNU
-- ============================================================

-- Definicja kolumn (Rundown Studio-style)
CREATE TABLE IF NOT EXISTS columns (
    id               TEXT    PRIMARY KEY,
    rundown_id       TEXT    NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,             -- np. "Camera", "Script"
    type             TEXT    NOT NULL DEFAULT 'richtext'
                             CHECK(type IN ('richtext','dropdown','script')),
    sort_order       INTEGER NOT NULL DEFAULT 0,
    width_px         INTEGER NOT NULL DEFAULT 200,
    dropdown_options TEXT,                         -- JSON: ["Cam 1","Cam 2",...]
    is_script        INTEGER NOT NULL DEFAULT 0    -- 1 = używana przez prompter
                             CHECK(is_script IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_columns_rundown ON columns(rundown_id, sort_order);

-- Ukrywanie kolumn per-user (bez wpływu na innych)
CREATE TABLE IF NOT EXISTS column_visibility (
    id         TEXT    PRIMARY KEY,
    column_id  TEXT    NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    user_id    TEXT    NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    hidden     INTEGER NOT NULL DEFAULT 1 CHECK(hidden IN (0,1)),
    UNIQUE(column_id, user_id)
);


-- ============================================================
--  POZIOM 2: TEXT VARIABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS text_variables (
    id          TEXT    PRIMARY KEY,
    rundown_id  TEXT    NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
    key         TEXT    NOT NULL,                  -- [a-z0-9-], np. "host-name"
    value       TEXT    NOT NULL DEFAULT '',
    description TEXT,
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(rundown_id, key)
);

CREATE INDEX IF NOT EXISTS idx_text_vars_rundown ON text_variables(rundown_id);


-- ============================================================
--  POZIOM 2: OUTPUT CONFIGS (wyjścia / prompter)
-- ============================================================

CREATE TABLE IF NOT EXISTS output_configs (
    id          TEXT    PRIMARY KEY,
    rundown_id  TEXT    NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,                  -- np. "Monitor reżysera"
    layout      TEXT    NOT NULL DEFAULT 'list'
                        CHECK(layout IN ('list','single','prompter')),
    column_id   TEXT    REFERENCES columns(id) ON DELETE SET NULL,
    share_token TEXT    NOT NULL UNIQUE,           -- unikalny URL wyjścia
    settings    TEXT    NOT NULL DEFAULT '{}',     -- JSON: logo, kolory, prompter params
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_output_configs_token   ON output_configs(share_token);
CREATE INDEX IF NOT EXISTS idx_output_configs_rundown ON output_configs(rundown_id);


-- ============================================================
--  POZIOM 3: CUE GROUP
-- ============================================================

CREATE TABLE IF NOT EXISTS cue_groups (
    id          TEXT    PRIMARY KEY,
    rundown_id  TEXT    NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
    label       TEXT    NOT NULL,                  -- np. "Audience Engagement"
    sort_order  INTEGER NOT NULL DEFAULT 0,
    collapsed   INTEGER NOT NULL DEFAULT 0 CHECK(collapsed IN (0,1)),
    color       TEXT                               -- hex kolor labelki, NULL = brak
);

CREATE INDEX IF NOT EXISTS idx_cue_groups_rundown ON cue_groups(rundown_id, sort_order);


-- ============================================================
--  POZIOM 3: CUE (wpis w rundownie)
-- ============================================================

CREATE TABLE IF NOT EXISTS cues (
    id                  TEXT    PRIMARY KEY,
    rundown_id          TEXT    NOT NULL REFERENCES rundowns(id)   ON DELETE CASCADE,
    group_id            TEXT    REFERENCES cue_groups(id)          ON DELETE SET NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,

    -- Treść
    title               TEXT    NOT NULL DEFAULT '',
    subtitle            TEXT    NOT NULL DEFAULT '',

    -- Czas (Rundown Studio-mode: milisekundy)
    duration_ms         INTEGER NOT NULL DEFAULT 0 CHECK(duration_ms >= 0),
    start_type          TEXT    NOT NULL DEFAULT 'soft'
                                CHECK(start_type IN ('soft','hard')),
    hard_start_datetime TEXT,                      -- ISO datetime dla hard start
    auto_start          INTEGER NOT NULL DEFAULT 0 CHECK(auto_start IN (0,1)),

    -- Stan
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    background_color    TEXT,                      -- hex lub NULL
    status              TEXT    NOT NULL DEFAULT 'ready'
                                CHECK(status IN ('ready','standby','done','skipped')),

    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cues_rundown ON cues(rundown_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cues_group   ON cues(group_id);


-- ============================================================
--  POZIOM 3: CELL (zawartość cue × kolumna)
-- ============================================================

CREATE TABLE IF NOT EXISTS cells (
    id              TEXT    PRIMARY KEY,
    cue_id          TEXT    NOT NULL REFERENCES cues(id)    ON DELETE CASCADE,
    column_id       TEXT    NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    content_type    TEXT    NOT NULL DEFAULT 'richtext'
                            CHECK(content_type IN ('richtext','dropdown_value','file_ref')),
    richtext        TEXT,                          -- ProseMirror/TipTap JSON string
    dropdown_value  TEXT,                          -- wybrana opcja z Column.dropdown_options
    file_ref        TEXT,                          -- ścieżka do pliku (dla file_ref)
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(cue_id, column_id)
);

CREATE INDEX IF NOT EXISTS idx_cells_cue    ON cells(cue_id);
CREATE INDEX IF NOT EXISTS idx_cells_column ON cells(column_id);


-- ============================================================
--  POZIOM 3: PRIVATE NOTES (notatki prywatne per user per cue)
-- ============================================================

CREATE TABLE IF NOT EXISTS private_notes (
    id         TEXT    PRIMARY KEY,
    cue_id     TEXT    NOT NULL REFERENCES cues(id)  ON DELETE CASCADE,
    user_id    TEXT    NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    content    TEXT    NOT NULL DEFAULT '',
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(cue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_private_notes_cue  ON private_notes(cue_id);
CREATE INDEX IF NOT EXISTS idx_private_notes_user ON private_notes(user_id);


-- ============================================================
--  POZIOM 4: ACT (CuePilot-style, z osią czasu)
-- ============================================================

CREATE TABLE IF NOT EXISTS acts (
    id               TEXT    PRIMARY KEY,
    rundown_id       TEXT    NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
    cue_id           TEXT    REFERENCES cues(id) ON DELETE SET NULL, -- powiązanie z wierszem rundownu
    name             TEXT    NOT NULL,
    artist           TEXT,
    sort_order       INTEGER NOT NULL DEFAULT 0,

    -- Timecode (frame-based)
    duration_frames  INTEGER NOT NULL DEFAULT 0 CHECK(duration_frames >= 0),
    tc_offset_frames INTEGER NOT NULL DEFAULT 0,   -- offset od 00:00:00:00
    fps              INTEGER NOT NULL DEFAULT 25
                             CHECK(fps IN (24,25,29,30,50,60)),

    status           TEXT    NOT NULL DEFAULT 'draft'
                             CHECK(status IN ('draft','rehearsal','approved','live')),
    color            TEXT    NOT NULL DEFAULT '#1E3A5F',
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_acts_rundown ON acts(rundown_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_acts_cue     ON acts(cue_id);

-- Komentarze zespołu per akt
CREATE TABLE IF NOT EXISTS act_notes (
    id         TEXT    PRIMARY KEY,
    act_id     TEXT    NOT NULL REFERENCES acts(id)  ON DELETE CASCADE,
    user_id    TEXT    NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_act_notes_act ON act_notes(act_id);


-- ============================================================
--  POZIOM 5: TRACK (pas na osi czasu aktu)
-- ============================================================

CREATE TABLE IF NOT EXISTS tracks (
    id         TEXT    PRIMARY KEY,
    act_id     TEXT    NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL
                       CHECK(type IN ('vision','vision_fx','lyrics','cues','media','osc','gpi','midi')),
    name       TEXT    NOT NULL,                   -- np. "Vision – PGM", "Pyro GPI"
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    height_px  INTEGER NOT NULL DEFAULT 48,
    -- JSON per typ:
    --   vision / vision_fx: {"channel":"PGM","rs422_enabled":true}
    --   media:              {"volume":80,"muted":false}
    --   osc:                {"host":"192.168.1.10","port":8000,"schema_id":null}
    --   midi:               {"midi_channel":1,"device_name":"IAC Driver"}
    --   gpi:                {"serial_port":"/dev/ttyUSB0","baud_rate":9600}
    settings   TEXT    NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tracks_act ON tracks(act_id, sort_order);


-- ============================================================
--  POZIOM 5: MEDIA FILE (pliki audio/video referencji)
-- ============================================================

CREATE TABLE IF NOT EXISTS media_files (
    id              TEXT    PRIMARY KEY,
    act_id          TEXT    NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
    file_name       TEXT    NOT NULL,
    file_path       TEXT    NOT NULL,              -- ścieżka lokalna na dysku
    media_type      TEXT    NOT NULL CHECK(media_type IN ('audio','video')),
    duration_frames INTEGER NOT NULL DEFAULT 0,
    waveform_data   TEXT,                          -- JSON: float[] (ok. 200–500 próbek)
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_media_files_act ON media_files(act_id);


-- ============================================================
--  POZIOM 6: TIMELINE CUE (blok na osi czasu tracka)
-- ============================================================

CREATE TABLE IF NOT EXISTS timeline_cues (
    id             TEXT    PRIMARY KEY,
    track_id       TEXT    NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    act_id         TEXT    NOT NULL REFERENCES acts(id)   ON DELETE CASCADE, -- denorm.
    type           TEXT    NOT NULL
                           CHECK(type IN ('vision','vision_fx','lyric','marker','media','osc','gpi','midi')),

    -- Pozycja na osi czasu (frame-based)
    tc_in_frames   INTEGER NOT NULL DEFAULT 0 CHECK(tc_in_frames >= 0),
    tc_out_frames  INTEGER,                        -- NULL = cue punktowy (bez długości)
    z_order        INTEGER NOT NULL DEFAULT 0,

    -- JSON per typ:
    --   vision:     {"camera_number":1,"shot_name":"MCU LEAD","shot_description":"",
    --                "director_notes":"","switcher_channel":null,"operator_note":""}
    --   vision_fx:  {"effect_name":"DVE Split","macro_id":null,"key_on":true}
    --   lyric:      {"text":"Eight is a lucky number","language":"en"}
    --   marker:     {"label":"PYRO","color":"#FF5722","pre_warn_frames":50,"has_duration":false}
    --   media:      {"media_file_id":"uuid","offset_frames":0,"volume":100,"loop":false}
    --   osc:        {"address":"/layer/1/opacity","args":[1.0]}
    --   midi:       {"message_type":"note_on","note_or_cc":60,"velocity_or_val":127}
    --   gpi:        {"channel":1,"trigger_type":"pulse","pulse_ms":100}
    data           TEXT    NOT NULL DEFAULT '{}',

    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CHECK(tc_out_frames IS NULL OR tc_out_frames > tc_in_frames)
);

CREATE INDEX IF NOT EXISTS idx_timeline_cues_track  ON timeline_cues(track_id, tc_in_frames);
CREATE INDEX IF NOT EXISTS idx_timeline_cues_act    ON timeline_cues(act_id, tc_in_frames);
CREATE INDEX IF NOT EXISTS idx_timeline_cues_type   ON timeline_cues(act_id, type);


-- ============================================================
--  TRIGGERY: auto-update updated_at
-- ============================================================

CREATE TRIGGER IF NOT EXISTS trg_users_updated
    AFTER UPDATE ON users
    BEGIN UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_events_updated
    AFTER UPDATE ON events
    BEGIN UPDATE events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_projects_updated
    AFTER UPDATE ON projects
    BEGIN UPDATE projects SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_rundowns_updated
    AFTER UPDATE ON rundowns
    BEGIN UPDATE rundowns SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_cues_updated
    AFTER UPDATE ON cues
    BEGIN UPDATE cues SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_cells_updated
    AFTER UPDATE ON cells
    BEGIN UPDATE cells SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_acts_updated
    AFTER UPDATE ON acts
    BEGIN UPDATE acts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_timeline_cues_updated
    AFTER UPDATE ON timeline_cues
    BEGIN UPDATE timeline_cues SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_output_configs_updated
    AFTER UPDATE ON output_configs
    BEGIN UPDATE output_configs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_text_vars_updated
    AFTER UPDATE ON text_variables
    BEGIN UPDATE text_variables SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_private_notes_updated
    AFTER UPDATE ON private_notes
    BEGIN UPDATE private_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;


-- ============================================================
--  POZIOM 5B: TEAM NOTES (notatki zespołowe — widoczne dla wszystkich)
-- ============================================================

CREATE TABLE IF NOT EXISTS team_notes (
    id            TEXT    PRIMARY KEY,
    rundown_id    TEXT    NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
    cue_id        TEXT    REFERENCES cues(id) ON DELETE SET NULL,  -- NULL = notatka globalna
    author_name   TEXT    NOT NULL,
    content       TEXT    NOT NULL,
    resolved      INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0, 1)),
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_team_notes_rundown ON team_notes(rundown_id);
CREATE INDEX IF NOT EXISTS idx_team_notes_cue     ON team_notes(cue_id);

CREATE TRIGGER IF NOT EXISTS trg_team_notes_updated
    AFTER UPDATE ON team_notes
    BEGIN UPDATE team_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;


-- ============================================================
--  POZIOM 6: APP SETTINGS (key-value store)
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER IF NOT EXISTS trg_app_settings_updated
    AFTER UPDATE ON app_settings
    BEGIN UPDATE app_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key = NEW.key; END;


-- ============================================================
--  SEED: domyślny admin
--  Hasło: "admin" (bcrypt — zastąp przed produkcją!)
-- ============================================================

INSERT OR IGNORE INTO users (id, name, email, password_hash)
VALUES (
    'usr_000000000000000000000000000001',
    'Admin',
    'admin@localhost',
    '$2b$12$PLACEHOLDER_REPLACE_WITH_REAL_BCRYPT_HASH'
);
