import { ownership, requireCompany, requireResponsibleUser } from '../shared.js';

const include = { ...ownership, company: { select: { id: true, name: true } } };
export function createContactService(db) {
  return {
    async create(data) {
      await requireCompany(db, data.companyId);
      await requireResponsibleUser(db, data.responsibleUserId);
      return db.contact.create({ data, include });
    },
    list({ limit, offset }, companyId) {
      return db.contact.findMany({ where: companyId ? { companyId } : {}, take: limit, skip: offset,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include });
    },
    async listForCompany(id, query) {
      await requireCompany(db, id);
      return this.list(query, id);
    },
    get(id) { return db.contact.findUniqueOrThrow({ where: { id }, include }); },
    async update(id, data) {
      await db.contact.findUniqueOrThrow({ where: { id }, select: { id: true } });
      if (data.companyId) await requireCompany(db, data.companyId);
      await requireResponsibleUser(db, data.responsibleUserId);
      return db.contact.update({ where: { id }, data, include });
    },
    remove(id) { return db.contact.delete({ where: { id } }); },
  };
}
