import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('GitHub Actions Docker Publish Workflow Validation', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'docker-publish.yml');

  it('1. Workflow file exists and is non-empty', () => {
    assert.strictEqual(fs.existsSync(workflowPath), true, 'Workflow file must exist');
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.length > 50, 'Workflow content must not be empty');
  });

  it('2. Triggers on pushes to the main branch', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('branches:'), 'Must specify branches trigger');
    assert.ok(content.includes('- main') || content.includes('["main"]'), 'Must target main branch');
    assert.ok(content.includes('workflow_dispatch:'), 'Must allow manual triggering');
  });

  it('3. Authenticates to GHCR using built-in GITHUB_TOKEN', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('registry: ${{ env.REGISTRY }}') || content.includes('registry: ghcr.io'), 'Must point to GHCR');
    assert.ok(content.includes('ghcr.io'), 'Registry must be ghcr.io');
    assert.ok(content.includes('${{ secrets.GITHUB_TOKEN }}'), 'Must authenticate using secrets.GITHUB_TOKEN');
    assert.ok(!content.includes('PAT') && !content.includes('PERSONAL_ACCESS_TOKEN'), 'Must not hardcode or require personal access tokens');
  });

  it('4. Uses Docker Buildx and GitHub Actions cache', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('docker/setup-buildx-action'), 'Must configure Docker Buildx action');
    assert.ok(content.includes('cache-from: type=gha'), 'Must use GitHub Actions cache for build efficiency');
    assert.ok(content.includes('cache-to: type=gha'), 'Must export cache to GitHub Actions');
  });

  it('5. Generates lowercase GHCR image name and tags (latest, commit SHA)', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('docker/metadata-action'), 'Must use docker/metadata-action for lowercase & standard OCI tags');
    assert.ok(content.includes('type=raw,value=latest'), 'Must tag latest for main branch');
    assert.ok(content.includes('type=sha'), 'Must tag git commit SHA');
  });

  it('6. Explicitly grants packages: write permission for GHCR push', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('packages: write'), 'Must grant packages: write permission');
    assert.ok(content.includes('contents: read'), 'Must grant contents: read permission');
  });

  it('7. Uses existing Dockerfile context and path', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('file: ./Dockerfile') || content.includes('file: Dockerfile'), 'Must use root Dockerfile');
    assert.ok(content.includes('context: .'), 'Must build from root context');
  });
});
