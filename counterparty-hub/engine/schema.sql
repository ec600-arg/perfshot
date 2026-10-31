-- Esquema para Postgres / Supabase. Reemplaza al FileStore local (src/store.ts).
-- Los datos de riesgo son por CUIT y se comparten entre clientes; la cartera y la exposición son de cada cliente.

create table empresas (
  cuit              char(11) primary key,
  razon_social      text not null,
  sector            text,
  inicio_actividad  smallint,
  creado_en         timestamptz not null default now()
);

-- Una fila por evaluación: es la historia que alimenta el gráfico de 24 meses y la auditoría.
create table evaluaciones (
  id            bigint generated always as identity primary key,
  cuit          char(11) not null references empresas(cuit),
  calculado_en  timestamptz not null default now(),
  nivel         smallint not null check (nivel between 0 and 4),   -- 0 Bajo … 4 Crítico
  confianza     text not null check (confianza in ('alta','media','baja')),
  resultado     jsonb not null                                     -- CompanyResult completo (src/types.ts)
);
create index on evaluaciones (cuit, calculado_en desc);

-- Investigación con IA cacheada (lo caro): se reutiliza hasta 30 días salvo que el BCRA empeore.
create table investigaciones (
  id            bigint generated always as identity primary key,
  cuit          char(11) not null references empresas(cuit),
  realizada_en  timestamptz not null default now(),
  hallazgos     jsonb not null,
  notas         text not null
);
create index on investigaciones (cuit, realizada_en desc);

create table alertas (
  id         bigint generated always as identity primary key,
  cuit       char(11) not null references empresas(cuit),
  clave      text not null,                -- Alert.key: evita repetir la misma alerta
  fecha      date not null,
  gravedad   text not null check (gravedad in ('crit','high','mod','low')),
  titulo     text not null,
  detalle    text not null,
  creada_en  timestamptz not null default now(),
  unique (cuit, clave)
);

-- Clientes de Centinel (cada empresa que paga la suscripción) y su cartera.
create table clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  plan       text not null default 'esencial',
  creado_en  timestamptz not null default now()
);

create table cartera (
  cliente_id   uuid not null references clientes(id) on delete cascade,
  cuit         char(11) not null references empresas(cuit),
  saldo        numeric(18,2),
  vencido      numeric(18,2),
  limite       numeric(18,2),
  compras_mes  numeric(18,2),
  responsable  text,
  notas        text,
  agregado_en  timestamptz not null default now(),
  primary key (cliente_id, cuit)
);

-- En Supabase: activar Row Level Security en clientes y cartera para que cada cliente vea sólo lo suyo.
alter table clientes enable row level security;
alter table cartera  enable row level security;
