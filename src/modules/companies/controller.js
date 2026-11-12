export function createCompanyController(service) {
  return {
    async create(req, res) {
      const data = await service.create(req.body, req.user.id);
      res.location(`/api/v1/companies/${data.id}`).status(201).json({ data });
    },
    async list(req, res) { res.json({ data: await service.list(req.validatedQuery) }); },
    async get(req, res) { res.json({ data: await service.get(req.params.id) }); },
    async update(req, res) { res.json({ data: await service.update(req.params.id, req.body) }); },
    async remove(req, res) { await service.remove(req.params.id); res.status(204).end(); },
  };
}
