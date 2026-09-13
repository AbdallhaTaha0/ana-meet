import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export interface ContactAttributes {
  id: string;
  userId: string;
  contactUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

type ContactCreation = Optional<ContactAttributes, 'id' | 'createdAt' | 'updatedAt'>;

// A contact is a private bookmark owned by userId. It does NOT imply
// conversation membership and does NOT notify the other side.
export class Contact extends Model<ContactAttributes, ContactCreation> implements ContactAttributes {
  declare id: string;
  declare userId: string;
  declare contactUserId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initContact(sequelize: Sequelize): void {
  Contact.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      contactUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'contact_user_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      sequelize,
      tableName: 'contacts',
      indexes: [
        { unique: true, fields: ['user_id', 'contact_user_id'], name: 'contacts_pair_unique' },
        { fields: ['user_id'], name: 'contacts_user_id_idx' },
        { fields: ['contact_user_id'], name: 'contacts_contact_user_id_idx' },
      ],
    },
  );

  User.hasMany(Contact, { foreignKey: 'userId', as: 'contacts', onDelete: 'CASCADE' });
  Contact.belongsTo(User, { foreignKey: 'userId', as: 'owner' });
  Contact.belongsTo(User, { foreignKey: 'contactUserId', as: 'contactUser' });
}
