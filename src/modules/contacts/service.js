import { ownership, requireCompany, requireResponsibleUser } from '../shared.js';

const include = { ...ownership, company: { select: { id: true, name: true } } };
export function createContactService(db) {
  return {
    async create(data, createdById) {
      await requireCompany(db, data.companyId);
      await requireResponsibleUser(db, data.responsibleUserId);
      return db.contact.create({ data: { ...data, full_name: `${data.firstName} ${data.lastName}`, createdById }, include });
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
      const current = await db.contact.findUniqueOrThrow({ where: { id } });
      if (data.companyId) await requireCompany(db, data.companyId);
      await requireResponsibleUser(db, data.responsibleUserId);
      // Keep the original full name until both explicit name parts are available.
      if (data.firstName !== undefined || data.lastName !== undefined) {
        const first = data.firstName ?? current.firstName;
        const last = data.lastName ?? current.lastName;
        if (first && last) data = { ...data, full_name: `${first} ${last}` };
      }
      return db.contact.update({ where: { id }, data, include });
    },
    remove(id) { return db.contact.delete({ where: { id } }); },
  };
}
