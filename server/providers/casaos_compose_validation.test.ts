import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('CasaOS Deployment Definition Validation', () => {
  const casaosComposePath = path.join(process.cwd(), 'casaos', 'docker-compose.yml');
  const casaosIconPath = path.join(process.cwd(), 'casaos', 'icon.svg');
  const publicIconPath = path.join(process.cwd(), 'public', 'casaos-icon.svg');
  const rootComposePath = path.join(process.cwd(), 'docker-compose.yml');

  it('1. casaos/docker-compose.yml exists and root docker-compose.yml is untouched', () => {
    assert.strictEqual(fs.existsSync(casaosComposePath), true, 'casaos/docker-compose.yml must exist');
    assert.strictEqual(fs.existsSync(rootComposePath), true, 'root docker-compose.yml must exist');
    
    const rootCompose = fs.readFileSync(rootComposePath, 'utf8');
    assert.ok(rootCompose.includes('build:'), 'Root docker-compose.yml should remain for local development');
  });

  it('2. Uses exact published GHCR image', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    assert.ok(content.includes('image: ghcr.io/3omrosama/infra:latest'), 'Must use ghcr.io/3omrosama/infra:latest');
  });

  it('3. Contains official x-casaos metadata block with all required fields', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    // Check top-level x-casaos fields
    assert.ok(content.includes('x-casaos:'), 'Must define x-casaos block');
    assert.ok(content.includes('main: inframanager'), 'Must specify main service');
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
    assert.ok(content.includes('icon:'), 'Must include icon reference');
  });

  it('4. Defines both application and PostgreSQL containers with internal networking', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('inframanager:'), 'Must declare inframanager service');
    assert.ok(content.includes('postgres:'), 'Must declare postgres service');
    assert.ok(content.includes('image: postgres:16-alpine'), 'Postgres service must use postgres:16-alpine');
    assert.ok(content.includes('inframanager_net:'), 'Must define shared internal bridge network');
  });

  it('5. Configures persistent volumes for application data and PostgreSQL', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('inframanager_postgres_data:'), 'Must declare postgres data volume');
    assert.ok(content.includes('inframanager_data:'), 'Must declare app data volume');
    assert.ok(content.includes('/var/lib/postgresql/data'), 'Must mount postgres storage');
    assert.ok(content.includes('/app/data'), 'Must mount app storage');
  });

  it('6. Configures PostgreSQL healthcheck and service dependency', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('healthcheck:'), 'Postgres must include healthcheck');
    assert.ok(content.includes('pg_isready'), 'Healthcheck must use pg_isready');
    assert.ok(content.includes('condition: service_healthy'), 'App container must wait for postgres to be healthy');
  });

  it('7. Sets required environment variables with safe defaults', () => {
    const content = fs.readFileSync(casaosComposePath, 'utf8');
    
    assert.ok(content.includes('NODE_ENV=production'), 'Must set NODE_ENV=production');
    assert.ok(content.includes('PORT=3000'), 'Must set PORT=3000');
    assert.ok(content.includes('DATABASE_URL='), 'Must set DATABASE_URL');
    assert.ok(content.includes('JWT_SECRET='), 'Must set JWT_SECRET placeholder');
    assert.ok(content.includes('CREDENTIAL_ENCRYPTION_KEY='), 'Must set CREDENTIAL_ENCRYPTION_KEY placeholder');
    assert.ok(content.includes('MONITOR_POLL_INTERVAL_SECONDS='), 'Must set monitor poll interval');
    assert.ok(content.includes('METRIC_RETENTION_DAYS='), 'Must set metric retention days');
  });

  it('8. Professional SVG icon exists and is valid XML', () => {
    assert.strictEqual(fs.existsSync(casaosIconPath), true, 'casaos/icon.svg must exist');
    assert.strictEqual(fs.existsSync(publicIconPath), true, 'public/casaos-icon.svg must exist');
    
    const svg = fs.readFileSync(casaosIconPath, 'utf8');
    assert.ok(svg.includes('<svg'), 'Must be valid SVG root');
    assert.ok(svg.includes('viewBox="0 0 256 256"'), 'Must have square 256x256 viewBox');
    assert.ok(svg.includes('</svg>'), 'Must have closing tag');
  });
});
