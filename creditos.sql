-- ============ CRÉDITOS (apartados con cuotas) — corre una sola vez ============
alter table clientes add column if not exists de_confianza boolean not null default false;
alter table clientes add column if not exists limite_credito_usd numeric;

alter table apartados alter column producto_id drop not null;
alter table apartados alter column producto_nombre_historico drop not null;
alter table apartados add column if not exists tipo text not null default 'reserva';
alter table apartados add column if not exists cotizacion_id uuid references cotizaciones(id) on delete set null;
alter table apartados add column if not exists cotizacion_numero integer;
alter table apartados add column if not exists frecuencia text;
alter table apartados add column if not exists n_cuotas integer;
alter table apartados add column if not exists inicial_usd numeric not null default 0;
alter table apartados add column if not exists moneda_pago text not null default 'usd';
alter table apartados add column if not exists baja_hecha boolean not null default false;
alter table apartados add column if not exists motivo_cancelacion text;
do $$ begin
  alter table apartados add constraint apartados_tipo_ck check (tipo in ('reserva','credito'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table apartados add constraint apartados_frec_ck check (frecuencia is null or frecuencia in ('semanal','quincenal','mensual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table apartados add constraint apartados_mon_ck check (moneda_pago in ('usd','ves_binance'));
exception when duplicate_object then null; end $$;
create unique index if not exists ux_credito_activo_cot on apartados(cotizacion_id) where tipo='credito' and estado='activo';

alter table apartados_abonos add column if not exists moneda text not null default 'usd';
alter table apartados_abonos add column if not exists monto_moneda numeric;
alter table apartados_abonos add column if not exists tasa_binance numeric;
alter table apartados_abonos add column if not exists referencia text;
alter table apartados_abonos add column if not exists es_inicial boolean not null default false;
alter table apartados_abonos add column if not exists anulado boolean not null default false;
alter table apartados_abonos add column if not exists anulado_motivo text;
alter table apartados_abonos add column if not exists anulado_por uuid;
alter table apartados_abonos add column if not exists anulado_el timestamptz;

create table if not exists apartado_cuotas(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  apartado_id uuid not null references apartados(id) on delete cascade,
  numero integer not null,
  vence_el date not null,
  monto_usd numeric not null check (monto_usd > 0),
  pagado_usd numeric not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente','parcial','pagada')),
  pagada_el timestamptz,
  unique(apartado_id, numero)
);
create index if not exists ix_cuotas_vence on apartado_cuotas(tenant_id, vence_el) where estado <> 'pagada';
alter table apartado_cuotas enable row level security;

-- RLS: dueño/publicador ven todo el negocio; vendedor solo lo suyo
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where tablename in ('apartados','apartados_abonos','apartado_cuotas') loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;
create policy "apartados: negocio / propios" on apartados for all
  using (tenant_id = current_tenant_id() and tenant_activo() and (rol_edita() or creado_por = auth.uid()))
  with check (tenant_id = current_tenant_id() and tenant_activo());
create policy "abonos: negocio / propios" on apartados_abonos for all
  using (tenant_id = current_tenant_id() and tenant_activo() and exists(select 1 from apartados a where a.id = apartado_id))
  with check (tenant_id = current_tenant_id() and tenant_activo());
create policy "cuotas: negocio / propios" on apartado_cuotas for all
  using (tenant_id = current_tenant_id() and tenant_activo() and exists(select 1 from apartados a where a.id = apartado_id))
  with check (tenant_id = current_tenant_id() and tenant_activo());

create or replace function hoy_ve() returns date language sql stable as $$ select (now() at time zone 'America/Caracas')::date $$;

create or replace function fecha_cuota(p_base date, p_frec text, p_n integer) returns date language sql immutable as $$
  select case p_frec when 'semanal' then p_base + 7*p_n when 'quincenal' then p_base + 15*p_n
         else (p_base + (p_n || ' month')::interval)::date end $$;

-- Marcar cliente de confianza (solo dueño)
create or replace function cliente_confianza(p_cliente uuid, p_valor boolean, p_limite numeric default null)
returns void language plpgsql as $$
begin
  if not rol_dueno() then raise exception 'Solo el dueño puede marcar clientes de confianza.'; end if;
  update clientes set de_confianza = p_valor, limite_credito_usd = case when p_valor then p_limite else null end where id = p_cliente;
  if not found then raise exception 'Cliente no encontrado.'; end if;
end $$;

-- Reparte lo pagado en las cuotas (de la más antigua a la más nueva) y cierra el crédito si ya se pagó todo
create or replace function credito_recalcular(p_id uuid) returns void language plpgsql as $$
declare a apartados; v_paid numeric; v_rem numeric; q record; v_pay numeric;
begin
  select * into a from apartados where id = p_id;
  if not found then return; end if;
  select coalesce(sum(monto_usd),0) into v_paid from apartados_abonos where apartado_id = p_id and not anulado;
  v_rem := greatest(v_paid - a.inicial_usd, 0);
  for q in select * from apartado_cuotas where apartado_id = p_id order by numero loop
    v_pay := least(v_rem, q.monto_usd); v_rem := v_rem - v_pay;
    update apartado_cuotas set pagado_usd = v_pay,
      estado = case when v_pay >= q.monto_usd - 0.005 then 'pagada' when v_pay > 0 then 'parcial' else 'pendiente' end,
      pagada_el = case when v_pay >= q.monto_usd - 0.005 then coalesce(pagada_el, now()) else null end
    where id = q.id;
  end loop;
  update apartados set abonado_usd = v_paid, updated_at = now() where id = p_id;
  if a.estado = 'activo' and v_paid >= a.precio_total_usd - 0.005 then
    update apartados set estado = 'completado', updated_at = now() where id = p_id;
    if a.tipo = 'credito' and not a.baja_hecha then perform credito_baja(p_id); end if;
  end if;
end $$;

-- Da de baja el/los producto(s) de la cotización (descuenta stock y registra la venta)
create or replace function credito_baja(p_id uuid) returns void language plpgsql as $$
declare a apartados; it record; v_sum numeric; v_f numeric; t record;
begin
  select * into a from apartados where id = p_id;
  if not found or a.estado <> 'completado' or a.baja_hecha or a.tipo <> 'credito' then return; end if;
  select tasa_bcv, tasa_binance into t from tasas_cambio order by fecha desc limit 1;
  select coalesce(sum(subtotal),0) into v_sum from cotizacion_items where cotizacion_id = a.cotizacion_id and producto_id is not null;
  v_f := case when v_sum > 0 then a.precio_total_usd / v_sum else 1 end;
  for it in select producto_id, cantidad, subtotal from cotizacion_items where cotizacion_id = a.cotizacion_id and producto_id is not null loop
    perform registrar_venta(it.producto_id, greatest(it.cantidad::int,1), round(it.subtotal * v_f, 2), 'USD', 'credito', 'credito',
      'Crédito completado — cotización N° ' || coalesce(a.cotizacion_numero::text,'-'), auth.uid(), t.tasa_bcv, t.tasa_binance, a.cliente_id);
  end loop;
  update apartados set baja_hecha = true where id = p_id;
end $$;

create or replace function credito_crear(
  p_cotizacion uuid, p_inicial_usd numeric, p_n_cuotas integer, p_frecuencia text, p_primera date,
  p_metodo_inicial text default 'efectivo', p_moneda_pago text default 'usd', p_notas text default null)
returns uuid language plpgsql as $$
declare c cotizaciones; cl clientes; v_id uuid; v_saldo numeric; v_base numeric; i integer; v_expuesto numeric; v_item record; v_disp numeric; v_n integer; v_prim date;
begin
  select * into c from cotizaciones where id = p_cotizacion;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if c.cliente_id is null then raise exception 'La cotización debe estar ligada a un cliente guardado (marca "Guardar cliente").'; end if;
  select * into cl from clientes where id = c.cliente_id;
  if not cl.de_confianza then raise exception 'Este cliente no está marcado como de confianza.'; end if;
  if p_inicial_usd is null or p_inicial_usd < 0 or p_inicial_usd >= c.total then raise exception 'La inicial debe ser menor al total ($%).', c.total; end if;
  if p_frecuencia not in ('semanal','quincenal','mensual') then raise exception 'Frecuencia inválida.'; end if;
  if p_n_cuotas is null or p_n_cuotas < 1 or p_n_cuotas > 52 then raise exception 'Número de cuotas inválido (1 a 52).'; end if;
  if exists(select 1 from apartados a join apartado_cuotas q on q.apartado_id = a.id
            where a.cliente_id = cl.id and a.estado = 'activo' and q.estado <> 'pagada' and q.vence_el < hoy_ve()) then
    raise exception 'El cliente tiene cuotas vencidas. Debe ponerse al día antes de otro crédito.';
  end if;
  v_saldo := round(c.total - p_inicial_usd, 2);
  select coalesce(sum(precio_total_usd - abonado_usd),0) into v_expuesto from apartados where cliente_id = cl.id and tipo='credito' and estado='activo';
  if cl.limite_credito_usd is not null and v_expuesto + v_saldo > cl.limite_credito_usd then
    raise exception 'Supera el límite de crédito del cliente ($%). Ya debe $%.', cl.limite_credito_usd, round(v_expuesto,2);
  end if;
  for v_item in select ci.producto_id, ci.cantidad, p.nombre from cotizacion_items ci join productos p on p.id = ci.producto_id where ci.cotizacion_id = c.id loop
    select pu.stock - coalesce((select sum(ci2.cantidad) from apartados a2 join cotizacion_items ci2 on ci2.cotizacion_id = a2.cotizacion_id
        where a2.tipo='credito' and a2.estado='activo' and not a2.baja_hecha and ci2.producto_id = v_item.producto_id),0)
      into v_disp from publicaciones pu where pu.producto_id = v_item.producto_id limit 1;
    if v_disp is not null and v_disp < v_item.cantidad then raise exception 'No hay stock disponible de "%" (libre: %).', v_item.nombre, v_disp; end if;
  end loop;
  v_prim := coalesce(p_primera, fecha_cuota(hoy_ve(), p_frecuencia, 1));
  insert into apartados(producto_id, producto_nombre_historico, cliente_id, cliente_nombre, cliente_telefono, precio_total_usd, abonado_usd, estado,
      notas, tipo, cotizacion_id, cotizacion_numero, frecuencia, n_cuotas, inicial_usd, moneda_pago)
    values (null, 'Cotización N° ' || c.numero, cl.id, cl.nombre, coalesce(cl.telefono, c.cliente_telefono), c.total, 0, 'activo',
      p_notas, 'credito', c.id, c.numero, p_frecuencia, p_n_cuotas, p_inicial_usd, coalesce(p_moneda_pago,'usd'))
    returning id into v_id;
  v_base := round(v_saldo / p_n_cuotas, 2);
  for i in 1..p_n_cuotas loop
    insert into apartado_cuotas(apartado_id, numero, vence_el, monto_usd)
      values (v_id, i, case when i = 1 then v_prim else fecha_cuota(v_prim, p_frecuencia, i - 1) end,
              case when i = p_n_cuotas then v_saldo - v_base * (p_n_cuotas - 1) else v_base end);
  end loop;
  if p_inicial_usd > 0 then
    insert into apartados_abonos(apartado_id, monto_usd, metodo_pago, es_inicial, notas) values (v_id, p_inicial_usd, p_metodo_inicial, true, 'Inicial');
  end if;
  perform credito_recalcular(v_id);
  return v_id;
end $$;

-- Registrar un pago (en $ o en Bs a la tasa Binance del día)
create or replace function credito_pagar(p_apartado uuid, p_monto numeric, p_moneda text, p_metodo text, p_ref text default null, p_notas text default null)
returns jsonb language plpgsql as $$
declare a apartados; v_tasa numeric; v_usd numeric; v_saldo numeric;
begin
  select * into a from apartados where id = p_apartado;
  if not found then raise exception 'Crédito no encontrado.'; end if;
  if a.estado <> 'activo' then raise exception 'Este crédito ya no está activo.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Monto inválido.'; end if;
  select tasa_binance into v_tasa from tasas_cambio order by fecha desc limit 1;
  if p_moneda = 'ves' then
    if v_tasa is null then raise exception 'No hay tasa Binance cargada.'; end if;
    v_usd := round(p_monto / v_tasa, 2);
  else v_usd := round(p_monto, 2); end if;
  v_saldo := a.precio_total_usd - a.abonado_usd;
  if v_usd > v_saldo + 0.02 then raise exception 'El pago ($%) supera el saldo ($%).', v_usd, round(v_saldo,2); end if;
  if v_usd > v_saldo then v_usd := v_saldo; end if;
  if v_usd <= 0 then raise exception 'Monto demasiado pequeño.'; end if;
  insert into apartados_abonos(apartado_id, monto_usd, metodo_pago, moneda, monto_moneda, tasa_binance, referencia, notas)
    values (p_apartado, v_usd, p_metodo, case when p_moneda = 'ves' then 'ves' else 'usd' end, p_monto, case when p_moneda = 'ves' then v_tasa end, p_ref, p_notas);
  perform credito_recalcular(p_apartado);
  select * into a from apartados where id = p_apartado;
  return jsonb_build_object('estado', a.estado, 'saldo', round(a.precio_total_usd - a.abonado_usd, 2), 'pagado_usd', v_usd);
end $$;

create or replace function credito_anular_pago(p_abono uuid, p_motivo text) returns void language plpgsql as $$
declare b apartados_abonos; a apartados;
begin
  if not rol_dueno() then raise exception 'Solo el dueño puede anular pagos.'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Escribe el motivo.'; end if;
  select * into b from apartados_abonos where id = p_abono;
  if not found or b.anulado then raise exception 'Pago no encontrado.'; end if;
  select * into a from apartados where id = b.apartado_id;
  if a.estado = 'completado' then raise exception 'El crédito ya se completó y el producto se dio de baja; no se puede anular.'; end if;
  update apartados_abonos set anulado = true, anulado_motivo = p_motivo, anulado_por = auth.uid(), anulado_el = now() where id = p_abono;
  perform credito_recalcular(b.apartado_id);
end $$;

create or replace function credito_cancelar(p_id uuid, p_motivo text) returns void language plpgsql as $$
begin
  if not rol_edita() then raise exception 'Solo el dueño o publicador puede cancelar un crédito.'; end if;
  update apartados set estado = 'cancelado', motivo_cancelacion = p_motivo, updated_at = now() where id = p_id and estado = 'activo';
  if not found then raise exception 'Crédito no encontrado o ya cerrado.'; end if;
end $$;

-- Lista de cobros (vencidas + próximas) con monto en Bs a la tasa de HOY
create or replace function credito_cobros(p_dias integer default 3)
returns table(cuota_id uuid, apartado_id uuid, cotizacion_numero integer, cliente_nombre text, cliente_telefono text, vendedor text,
              numero integer, n_cuotas integer, vence_el date, atraso integer, saldo_cuota_usd numeric, tasa_binance numeric,
              saldo_cuota_bs numeric, moneda_pago text)
language sql stable as $$
  with t as (select tasa_binance from tasas_cambio order by fecha desc limit 1)
  select q.id, a.id, a.cotizacion_numero, a.cliente_nombre, a.cliente_telefono, pr.nombre, q.numero, a.n_cuotas, q.vence_el,
         (hoy_ve() - q.vence_el), round(q.monto_usd - q.pagado_usd, 2), t.tasa_binance,
         round((q.monto_usd - q.pagado_usd) * t.tasa_binance, 2), a.moneda_pago
  from apartado_cuotas q join apartados a on a.id = q.apartado_id
  left join profiles pr on pr.id = a.creado_por cross join t
  where a.estado = 'activo' and q.estado <> 'pagada' and q.vence_el <= hoy_ve() + p_dias
  order by q.vence_el, a.cliente_nombre
$$;

grant execute on function cliente_confianza(uuid,boolean,numeric), credito_crear(uuid,numeric,integer,text,date,text,text,text),
  credito_pagar(uuid,numeric,text,text,text,text), credito_anular_pago(uuid,text), credito_cancelar(uuid,text), credito_cobros(integer) to authenticated;
grant execute on function credito_recalcular(uuid), credito_baja(uuid) to authenticated;
