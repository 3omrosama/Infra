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

  it('2. Starts with standard compose version for CasaOS parser compatibility', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.startsWith("version: '3.8'"), "Must specify version: '3.8' at line 1");
  });

  it('3. Main application service is named "inframanager" with exact GHCR image', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('inframanager:'), 'Must declare inframanager service');
    assert.ok(content.includes('image: ghcr.io/3omrosama/infra:latest'), 'Must use ghcr.io/3omrosama/infra:latest');
    assert.ok(content.includes('container_name: inframanager'), 'Must set stable container_name: inframanager');
    assert.ok(!content.includes('services:\n  app:'), 'Must not name main service generically as "app"');
  });

  it('4. PostgreSQL database service is named "postgres" with exact image', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('postgres:'), 'Must declare postgres service');
    assert.ok(content.includes('image: postgres:16-alpine'), 'Must use postgres:16-alpine');
    assert.ok(content.includes('container_name: postgres'), 'Must set stable container_name: postgres');
  });

  it('5. x-casaos.main accurately points to "inframanager"', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('main: inframanager'), 'x-casaos.main must point to inframanager');
    assert.ok(!content.includes('main: app'), 'x-casaos.main must not point to app');
  });

  it('6. DATABASE_URL points directly to PostgreSQL service DNS', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('DATABASE_URL=postgresql://noc_user:noc_secure_pass@postgres:5432/noc_infrastructure?schema=public'), 'DATABASE_URL must route to postgres host');
  });

  it('7. Contains official x-casaos metadata block with id and updated repository URLs', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('x-casaos:'), 'Must define x-casaos block');
    assert.ok(content.includes('id: com.3omrosama.inframanger'), 'Must declare id: com.3omrosama.inframanger');
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
    assert.ok(!content.includes('icon:'), 'Icon field should be removed as requested');
    assert.ok(content.includes('website: https://github.com/3omrosama/Infra'), 'Must reference correct website');
    assert.ok(content.includes('repo: https://github.com/3omrosama/Infra'), 'Must reference correct repo');
    assert.ok(content.includes('support: https://github.com/3omrosama/Infra/issues'), 'Must reference correct support URL');
    assert.ok(content.includes('docs: https://github.com/3omrosama/Infra#readme'), 'Must reference correct docs URL');
  });

  it('8. Configures persistent volumes and internal network for both containers', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('inframanager_postgres_data:'), 'Must declare postgres data volume');
    assert.ok(content.includes('inframanager_data:'), 'Must declare app data volume');
    assert.ok(content.includes('/var/lib/postgresql/data'), 'Must mount postgres storage');
    assert.ok(content.includes('/app/data'), 'Must mount app storage');
    assert.ok(content.includes('inframanager_net:'), 'Must define shared internal bridge network');
  });

  it('9. Configures PostgreSQL healthcheck and service dependency', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('healthcheck:'), 'Postgres must include healthcheck');
    assert.ok(content.includes('pg_isready'), 'Healthcheck must use pg_isready');
    assert.ok(content.includes('condition: service_healthy'), 'App container must wait for postgres to be healthy');
  });
});
