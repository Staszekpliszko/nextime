import Database from 'better-sqlite3';
import { generateId } from './base';

// ── Project ──────────────────────────────────────────────────

export type ProjectType = 'SOLO' | 'MINI' | 'PRO' | 'MAX';
export type ProjectStatus = 'draft' | 'active' | 'archived';
export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type FPS = 24 | 25 | 29 | 30 | 50 | 60;
export type SwitcherChannel = 'PGM' | 'ME1' | 'ME2' | 'AUX1' | 'AUX2' | 'AUX3';

export interface Project {
  id: string;
  event_id?: string;
  owner_id: string;
  name: string;
  slug: string;
  type: ProjectType;
  status: ProjectStatus;
  timezone: string;
  default_fps: FPS;
  description?: string;
  created_at: string;
  updated_at: string;
}

export type CreateProjectInput = {
  owner_id: string;
  name: string;
  slug: string;
  event_id?: string;
  type?: ProjectType;
  status?: ProjectStatus;
  timezone?: string;
  default_fps?: FPS;
  description?: string;
};

export type UpdateProjectInput = Partial<Omit<CreateProjectInput, 'owner_id'>>;

interface ProjectRow {
  id: string;
  event_id: string | null;
  owner_id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  timezone: string;
  default_fps: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    event_id: row.event_id ?? undefined,
    owner_id: row.owner_id,
    name: row.name,
    slug: row.slug,
    type: row.type as ProjectType,
    status: row.status as ProjectStatus,
    timezone: row.timezone,
    default_fps: row.default_fps as FPS,
    description: row.description ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── ProjectMember ────────────────────────────────────────────

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: MemberRole;
  invited_by?: string;
  joined_at: string;
}

export type CreateProjectMemberInput = {
  project_id: string;
  user_id: string;
  role?: MemberRole;
  invited_by?: string;
};

interface ProjectMemberRow {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  invited_by: string | null;
  joined_at: string;
}

function rowToMember(row: ProjectMemberRow): ProjectMember {
  return {
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    role: row.role as MemberRole,
    invited_by: row.invited_by ?? undefined,
    joined_at: row.joined_at,
  };
}

// ── CameraPreset ─────────────────────────────────────────────

export interface CameraPreset {
  id: string;
  project_id: string;
  number: number;
  label: string;
  color: string;
  default_channel: SwitcherChannel;
  operator_name?: string;
}

export type CreateCameraPresetInput = {
  project_id: string;
  number: number;
  label?: string;
  color?: string;
  default_channel?: SwitcherChannel;
  operator_name?: string;
};

interface CameraPresetRow {
  id: string;
  project_id: string;
  number: number;
  label: string;
  color: string;
  default_channel: string;
  operator_name: string | null;
}

function rowToPreset(row: CameraPresetRow): CameraPreset {
  return {
    id: row.id,
    project_id: row.project_id,
    number: row.number,
    label: row.label,
    color: row.color,
    default_channel: row.default_channel as SwitcherChannel,
    operator_name: row.operator_name ?? undefined,
  };
}

// ── Repository ───────────────────────────────────────────────

export function createProjectRepo(db: Database.Database) {
  return {
    // ── Projects ──
    create(input: CreateProjectInput): Project {
      const id = generateId();
      db.prepare(`
        INSERT INTO projects (id, owner_id, event_id, name, slug, type, status, timezone, default_fps, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.owner_id, input.event_id ?? null,
        input.name, input.slug,
        input.type ?? 'SOLO', input.status ?? 'draft',
        input.timezone ?? 'Europe/Warsaw', input.default_fps ?? 25,
        input.description ?? null,
      );
      return this.findById(id)!;
    },

    findById(id: string): Project | undefined {
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
      return row ? rowToProject(row) : undefined;
    },

    findBySlug(slug: string): Project | undefined {
      const row = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as ProjectRow | undefined;
      return row ? rowToProject(row) : undefined;
    },

    findByOwner(ownerId: string): Project[] {
      const rows = db.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY name').all(ownerId) as ProjectRow[];
      return rows.map(rowToProject);
    },

    findByEvent(eventId: string): Project[] {
      const rows = db.prepare('SELECT * FROM projects WHERE event_id = ? ORDER BY name').all(eventId) as ProjectRow[];
      return rows.map(rowToProject);
    },

    findAll(): Project[] {
      const rows = db.prepare('SELECT * FROM projects ORDER BY name').all() as ProjectRow[];
      return rows.map(rowToProject);
    },

    update(id: string, input: UpdateProjectInput): Project | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
      if (input.slug !== undefined) { fields.push('slug = ?'); values.push(input.slug); }
      if (input.event_id !== undefined) { fields.push('event_id = ?'); values.push(input.event_id); }
      if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type); }
      if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
      if (input.timezone !== undefined) { fields.push('timezone = ?'); values.push(input.timezone); }
      if (input.default_fps !== undefined) { fields.push('default_fps = ?'); values.push(input.default_fps); }
      if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }

      if (fields.length === 0) return this.findById(id);

      values.push(id);
      db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findById(id);
    },

    delete(id: string): boolean {
      const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      return result.changes > 0;
    },

    // ── Project Members ──
    addMember(input: CreateProjectMemberInput): ProjectMember {
      const id = generateId();
      db.prepare(`
        INSERT INTO project_members (id, project_id, user_id, role, invited_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, input.project_id, input.user_id, input.role ?? 'viewer', input.invited_by ?? null);
      return this.findMemberById(id)!;
    },

    findMemberById(id: string): ProjectMember | undefined {
      const row = db.prepare('SELECT * FROM project_members WHERE id = ?').get(id) as ProjectMemberRow | undefined;
      return row ? rowToMember(row) : undefined;
    },

    findMembersByProject(projectId: string): ProjectMember[] {
      const rows = db.prepare('SELECT * FROM project_members WHERE project_id = ?').all(projectId) as ProjectMemberRow[];
      return rows.map(rowToMember);
    },

    findMemberByProjectAndUser(projectId: string, userId: string): ProjectMember | undefined {
      const row = db.prepare(
        'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?'
      ).get(projectId, userId) as ProjectMemberRow | undefined;
      return row ? rowToMember(row) : undefined;
    },

    updateMemberRole(id: string, role: MemberRole): ProjectMember | undefined {
      db.prepare('UPDATE project_members SET role = ? WHERE id = ?').run(role, id);
      return this.findMemberById(id);
    },

    removeMember(id: string): boolean {
      const result = db.prepare('DELETE FROM project_members WHERE id = ?').run(id);
      return result.changes > 0;
    },

    // ── Camera Presets ──
    createPreset(input: CreateCameraPresetInput): CameraPreset {
      const id = generateId();
      db.prepare(`
        INSERT INTO camera_presets (id, project_id, number, label, color, default_channel, operator_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.project_id, input.number,
        input.label ?? '', input.color ?? '#2196F3',
        input.default_channel ?? 'PGM', input.operator_name ?? null,
      );
      return this.findPresetById(id)!;
    },

    findPresetById(id: string): CameraPreset | undefined {
      const row = db.prepare('SELECT * FROM camera_presets WHERE id = ?').get(id) as CameraPresetRow | undefined;
      return row ? rowToPreset(row) : undefined;
    },

    findPresetsByProject(projectId: string): CameraPreset[] {
      const rows = db.prepare(
        'SELECT * FROM camera_presets WHERE project_id = ? ORDER BY number'
      ).all(projectId) as CameraPresetRow[];
      return rows.map(rowToPreset);
    },

    updatePreset(id: string, input: Partial<Omit<CreateCameraPresetInput, 'project_id'>>): CameraPreset | undefined {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.number !== undefined) { fields.push('number = ?'); values.push(input.number); }
      if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
      if (input.color !== undefined) { fields.push('color = ?'); values.push(input.color); }
      if (input.default_channel !== undefined) { fields.push('default_channel = ?'); values.push(input.default_channel); }
      if (input.operator_name !== undefined) { fields.push('operator_name = ?'); values.push(input.operator_name); }

      if (fields.length === 0) return this.findPresetById(id);

      values.push(id);
      db.prepare(`UPDATE camera_presets SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.findPresetById(id);
    },

    deletePreset(id: string): boolean {
      const result = db.prepare('DELETE FROM camera_presets WHERE id = ?').run(id);
      return result.changes > 0;
    },
  };
}
