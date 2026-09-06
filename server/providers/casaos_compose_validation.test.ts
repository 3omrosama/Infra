import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('CasaOS Deployment Definition Validation', () => {
  const casaosComposePath = path.join(process.cwd(), 'casaos', 'docker-compose.yml');
  const rootComposePath = path.join(process.cwd(), 'docker-compose.yml');

  it('1. casaos/docker-compose.yml exists and root docker-compose.yml is untouched', () => {
    assert.strictEqual(fs.existsSync(casaosComposePath), true, 'casaos/docker-compose.yml must exist');
    assert.strictEqual(fs.existsSync(rootComposePath), true, 'root docker-compose.yml must exist');
    
    const rootCompose = fs.readFileSync(rootComposePath, 'utf8');
    assert.ok(rootCompose.includes('build:'), 'Root docker-compose.yml should remain for local development');
  });

  it('2. Main application service is named "inframanager" with immutable version tag', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('inframanager:'), 'Must declare inframanager service');
    assert.ok(content.includes('image: ghcr.io/3omrosama/infra:1.0.0'), 'Must use immutable version image tag');
    assert.ok(!content.includes('image: ghcr.io/3omrosama/infra:latest'), 'Must not use :latest tag');
    assert.ok(content.includes('container_name: inframanager'), 'Must set stable container_name: inframanager');
    assert.ok(!content.includes('services:\n  app:'), 'Must not name main service generically as "app"');
  });

  it('3. PostgreSQL database service is named "postgres" with exact image', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('postgres:'), 'Must declare postgres service');
    assert.ok(content.includes('image: postgres:16-alpine'), 'Must use postgres:16-alpine');
    assert.ok(content.includes('container_name: postgres'), 'Must set stable container_name: postgres');
  });

  it('4. x-casaos.main accurately points to "inframanager" and contains id', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('main: inframanager'), 'x-casaos.main must point to inframanager');
    assert.ok(content.includes('id: com.3omrosama.inframanger'), 'x-casaos.id must be defined');
    assert.ok(!content.includes('main: app'), 'x-casaos.main must not point to app');
  });

  it('5. DATABASE_URL points directly to PostgreSQL service DNS', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('DATABASE_URL=postgresql://noc_user:noc_secure_pass@postgres:5432/noc_infrastructure?schema=public'), 'DATABASE_URL must route to postgres host');
  });

  it('6. Uses CasaOS bind mount (/DATA/AppData/$AppID/postgres) and no named volumes block', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    // Check bind mount
    assert.ok(content.includes('/DATA/AppData/$AppID/postgres:/var/lib/postgresql/data'), 'Must map postgres storage to /DATA/AppData/$AppID/postgres');
    // Ensure no named top-level volumes block to avoid CasaOS [object Object] UI parsing bugs
    assert.ok(!content.includes('volumes:\n  inframanager_postgres_data:'), 'Must not use named volume declaration');
    assert.ok(!content.includes('/app/data'), 'Must not mount unneeded /app/data');
  });

  it('7. Contains official x-casaos metadata without external icon requirements', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('x-casaos:'), 'Must define x-casaos block');
    assert.ok(content.includes('title:'), 'Must include title');
    assert.ok(content.includes('en_us: "InfraManager"'), 'Must have English title');
    assert.ok(content.includes('tagline:'), 'Must include tagline');
    assert.ok(content.includes('description:'), 'Must include description');
    assert.ok(content.includes('port_map: "3000"'), 'Must map port 3000');
    assert.ok(content.includes('scheme: http'), 'Must specify http scheme');
    assert.ok(content.includes('architectures:'), 'Must specify supported architectures');
    assert.ok(content.includes('- amd64'), 'Must support amd64');
    assert.ok(content.includes('- arm64'), 'Must support arm64');
    assert.ok(content.includes('category: Utilities'), 'Must specify category');
    assert.ok(!content.includes('icon:'), 'Icon field should not be present');
  });

  it('8. Configures PostgreSQL healthcheck and service dependency', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('healthcheck:'), 'Postgres must include healthcheck');
    assert.ok(content.includes('pg_isready'), 'Healthcheck must use pg_isready');
    assert.ok(content.includes('condition: service_healthy'), 'App container must wait for postgres to be healthy');
    assert.ok(content.includes('inframanager_net:'), 'Must use internal bridge network');
  });
});
