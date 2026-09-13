import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export interface AdminAuditLogAttributes {
  id: string;
  adminId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt?: Date;
}

type AuditCreation = Optional<AdminAuditLogAttributes, 'id' | 'targetType' | 'targetId' | 'metadata' | 'createdAt'>;

// Append-only record of sensitive administrative actions. Survives admin
// account deletion (adminId SET NULL) so history is never rewritten.
export class AdminAuditLog
  extends Model<AdminAuditLogAttributes, AuditCreation>
  implements AdminAuditLogAttributes
{
  declare id: string;
  declare adminId: string | null;
  declare action: string;
  declare targetType: string | null;
  declare targetId: string | null;
  declare metadata: Record<string, unknown> | null;
  declare readonly createdAt: Date;
}

export function initAdminAuditLog(sequelize: Sequelize): void {
  AdminAuditLog.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      adminId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'admin_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      action: { type: DataTypes.STRING(64), allowNull: false },
      targetType: { type: DataTypes.STRING(32), allowNull: true, field: 'target_type' },
      targetId: { type: DataTypes.UUID, allowNull: true, field: 'target_id' },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'admin_audit_logs',
      // No updated_at column exists: timestamps managed explicitly above.
      timestamps: false,
      indexes: [
        { fields: ['admin_id'], name: 'admin_audit_logs_admin_idx' },
        { fields: ['created_at'], name: 'admin_audit_logs_created_idx' },
      ],
    },
  );

  User.hasMany(AdminAuditLog, { foreignKey: 'adminId', as: 'auditEntries', onDelete: 'SET NULL' });
  AdminAuditLog.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });
}
