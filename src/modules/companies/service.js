import { ownership, requireCompany, requireResponsibleUser } from '../shared.js';

export function createCompanyService(db) {
  return {
    async create(data, createdById) {
      await requireResponsibleUser(db, data.responsibleUserId);
      return db.company.create({ data: { ...data, createdById }, include: ownership });
    },
    list({ search, limit, offset }) {
      return db.company.findMany({
        where: search ? { name: { contains: search.replace(/[\\%_]/g, value => `\\${value}`), mode: 'insensitive' } } : {},
        take: limit, skip: offset, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: ownership,
      });
    },
    get(id) { return db.company.findUniqueOrThrow({ where: { id }, include: ownership }); },
    async update(id, data) {
      await requireCompany(db, id);
      await requireResponsibleUser(db, data.responsibleUserId);
      return db.company.update({ where: { id }, data, include: ownership });
    },
    // PostgreSQL RESTRICT is authoritative, including concurrent contact creation.
    remove(id) { return db.company.delete({ where: { id } }); },
  };
}
