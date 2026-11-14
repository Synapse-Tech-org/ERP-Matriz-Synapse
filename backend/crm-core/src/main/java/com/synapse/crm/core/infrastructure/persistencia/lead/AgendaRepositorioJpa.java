package com.synapse.crm.core.infrastructure.persistencia.lead;

import java.util.ArrayList;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;

import org.springframework.stereotype.Repository;

import com.synapse.crm.core.application.agendamento.AgendaRepositorio;
import com.synapse.crm.core.domain.lead.VisibilidadeLead;
import com.synapse.crm.sharedkernel.identidade.UsuarioContext;

@Repository
class AgendaRepositorioJpa implements AgendaRepositorio {
    private final EntityManager em;
    private final UsuarioContext usuario;

    AgendaRepositorioJpa(EntityManager em, UsuarioContext usuario) {
        this.em = em;
        this.usuario = usuario;
    }

    @Override
    public Dia listar(Filtro filtro, int limite) {
        var cb = em.getCriteriaBuilder();
        var consulta = cb.createQuery(Consulta.class);
        var agenda = consulta.from(AgendamentoEntity.class);
        var lead = consulta.from(LeadEntity.class);
        var criterios = new ArrayList<Predicate>();
        criterios.add(cb.equal(lead.get("id"), agenda.get("leadId")));
        criterios.add(VisibilidadeLeadSpecification.de(VisibilidadeLead.de(usuario.atual())).toPredicate(lead, consulta, cb));
        criterios.add(cb.greaterThanOrEqualTo(agenda.get("inicio"), filtro.inicio()));
        criterios.add(cb.lessThan(agenda.get("inicio"), filtro.fim()));
        if (filtro.estado() != null) criterios.add(cb.equal(agenda.get("estado"), filtro.estado()));
        if (!filtro.busca().isEmpty()) {
            String busca = "%" + filtro.busca().toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            criterios.add(cb.or(cb.like(cb.lower(lead.get("nome")), busca, '!'),
                    cb.like(cb.lower(agenda.get("profissional")), busca, '!'),
                    cb.like(cb.lower(agenda.get("tipo")), busca, '!')));
        }
        consulta.select(cb.construct(Consulta.class, agenda.get("id"), agenda.get("leadId"), lead.get("nome"),
                agenda.get("inicio"), agenda.get("profissional"), agenda.get("tipo"), agenda.get("cobertura"),
                agenda.get("estado"), agenda.get("revisao")))
                .where(criterios.toArray(Predicate[]::new))
                .orderBy(cb.asc(agenda.get("inicio")), cb.asc(agenda.get("id")));
        var itens = em.createQuery(consulta).setMaxResults(limite + 1).getResultList();
        return new Dia(itens.stream().limit(limite).toList(), itens.size() > limite);
    }

    @Override
    public Optional<Consulta> obterVisivel(UUID id) {
        return em.createQuery("""
                select a from AgendamentoEntity a where a.id = :id
                """, AgendamentoEntity.class).setParameter("id", id).getResultList().stream()
                .filter(a -> leadVisivel(a.leadId))
                .map(a -> new Consulta(a.id, a.leadId, null, a.inicio, a.profissional, a.tipo, a.cobertura, a.estado, a.revisao))
                .findFirst();
    }

    @Override
    public boolean leadVisivel(UUID id) {
        var cb = em.getCriteriaBuilder();
        var consulta = cb.createQuery(UUID.class);
        Root<LeadEntity> lead = consulta.from(LeadEntity.class);
        consulta.select(lead.get("id")).where(cb.equal(lead.get("id"), id),
                VisibilidadeLeadSpecification.de(VisibilidadeLead.de(usuario.atual())).toPredicate(lead, consulta, cb));
        return !em.createQuery(consulta).setMaxResults(1).getResultList().isEmpty();
    }

    @Override
    public void criar(Consulta consulta) {
        var entidade = new AgendamentoEntity();
        entidade.id = consulta.id();
        entidade.leadId = consulta.leadId();
        entidade.inicio = consulta.inicio();
        entidade.profissional = consulta.profissional();
        entidade.tipo = consulta.tipo();
        entidade.cobertura = consulta.cobertura();
        entidade.estado = consulta.estado();
        em.persist(entidade);
        em.flush();
    }

    @Override
    public boolean alterar(Consulta consulta, long revisao) {
        return em.createQuery("""
                update AgendamentoEntity a set a.inicio = :inicio, a.estado = :estado, a.revisao = :proxima
                where a.id = :id and a.revisao = :revisao
                """).setParameter("inicio", consulta.inicio()).setParameter("estado", consulta.estado())
                .setParameter("proxima", consulta.revisao()).setParameter("id", consulta.id())
                .setParameter("revisao", revisao).executeUpdate() == 1;
    }
}
