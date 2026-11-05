import pg from 'pg';
export function createStore(env){
  const pool=env.DATABASE_URL?new pg.Pool({connectionString:env.DATABASE_URL,max:4,connectionTimeoutMillis:4000,idleTimeoutMillis:30000}):null;
  pool?.on('error',()=>console.error(JSON.stringify({event:'database_unavailable'})));
  let initialized;
  async function initialize(){if(!pool)throw new Error('Database required');initialized||=(async()=>{await pool.query('CREATE TABLE IF NOT EXISTS payment_orders (id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');await pool.query('CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES payment_orders(id), status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');})().catch(e=>{initialized=null;throw e;});await initialized;}
  return {
    configured:!!pool,ready:initialize,
    async put(order){await initialize();await pool.query('INSERT INTO payment_orders (id,reference,data) VALUES ($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING',[order.id,order.reference,JSON.stringify(order)]);},
    async get(id){await initialize();return (await pool.query('SELECT data FROM payment_orders WHERE id=$1',[id])).rows[0]?.data;},
    async lock(id,operation){await initialize();const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);const order=(await client.query('SELECT data FROM payment_orders WHERE id=$1',[id])).rows[0]?.data;if(!order)throw new Error('Order not found');const result=await operation(order);await client.query('UPDATE payment_orders SET data=$2::jsonb,updated_at=NOW() WHERE id=$1',[id,JSON.stringify(order)]);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}},
    async event(provider,id,orderId,status){await initialize();return (await pool.query('INSERT INTO payment_events(id,provider,order_id,status) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id',[provider+':'+id,provider,orderId,status])).rowCount>0;},
    close:()=>pool?.end()
  };
}
