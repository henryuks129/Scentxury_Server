# 🚀 Scentxury CI/CD Pipeline Documentation

## Overview

The Scentxury Backend uses an extensive GitHub Actions CI/CD pipeline that ensures code quality, security, and reliable deployments.

---

## 📁 Workflow Files

| File | Purpose | Triggers |
|------|---------|----------|
| `ci-cd.yml` | Main CI/CD pipeline | Push to main/develop, PRs |
| `pr-checks.yml` | Pull Request validation | All PRs |
| `release.yml` | Version releases | Tags (v*.*.*) |
| `scheduled.yml` | Maintenance tasks | Daily/Weekly/Monthly |

---

## 🔄 Main CI/CD Pipeline (`ci-cd.yml`)

### Pipeline Flow

```
┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│  Quality  │───▶│  Security │───▶│   Test    │───▶│   Build   │
│   Check   │    │   Audit   │    │ (Vitest)  │    │    (TS)   │
└───────────┘    └───────────┘    └───────────┘    └───────────┘
                                                         │
                                                         ▼
┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│ Production│◀───│  Staging  │◀───│  Docker   │◀───│  Docker   │
│  Deploy   │    │  Deploy   │    │   Push    │    │   Build   │
└───────────┘    └───────────┘    └───────────┘    └───────────┘
```

### Jobs Description

#### 1. Quality Check (`quality`)
- **ESLint**: Static code analysis
- **Prettier**: Code formatting verification
- **TypeScript**: Type checking (`tsc --noEmit`)
- **Duration**: ~2-3 minutes

#### 2. Security Audit (`security`)
- **npm audit**: Checks for vulnerable dependencies
- **Snyk**: Deep security scanning
- **Duration**: ~3-5 minutes

#### 3. Tests (`test`)
- **Services**: MongoDB 7.0, Redis 7 (Docker containers)
- **Runner**: Vitest with coverage
- **Coverage**: Uploaded to Codecov
- **Duration**: ~5-10 minutes

#### 4. Build (`build`)
- **TypeScript compilation**: `npm run build`
- **Output**: `dist/` directory
- **Artifacts**: Uploaded for deployment
- **Duration**: ~2-3 minutes

#### 5. Docker Build (`docker`)
- **Registry**: GitHub Container Registry (GHCR)
- **Tags**: Branch name, SHA, `latest` (for main)
- **Cache**: GitHub Actions cache
- **Duration**: ~5-10 minutes

#### 6. Deploy Staging (`deploy-staging`)
- **Trigger**: Push to `develop` branch
- **Target**: AWS ECS (staging cluster)
- **Health Check**: 10 retries with 10s intervals
- **Duration**: ~5-10 minutes

#### 7. Deploy Production (`deploy-production`)
- **Trigger**: Push to `main` branch (after staging)
- **Target**: AWS ECS (production cluster)
- **Approval**: Environment protection rules
- **Notifications**: Slack webhook
- **Duration**: ~5-10 minutes

---

## 🔍 Pull Request Checks (`pr-checks.yml`)

### Triggered On
- PR opened, synchronized, reopened
- PR marked ready for review

### Jobs

1. **PR Info**: Stats and auto-labeling
2. **Quality Check**: Lint + TypeCheck
3. **Test Coverage**: Full test suite with coverage report
4. **Build Check**: Verify build succeeds
5. **Security Scan**: npm audit + secret detection
6. **Docker Build Test**: Verify Docker image builds

### PR Labels (Auto-assigned)
- `type: feature`, `type: bug`, `type: docs`
- `area: auth`, `area: products`, `area: orders`
- `size: XS/S/M/L/XL`
- `priority: high`, `breaking`

---

## 📦 Release Workflow (`release.yml`)

### Triggered On
- Git tags matching `v*.*.*` pattern
- Manual dispatch with version input

### Steps

1. **Validate**: Run tests, verify version
2. **Docker Release**: Build and push with version tags
3. **GitHub Release**: Create release with changelog
4. **Deploy**: Push to production
5. **Notify**: Slack notification

### Version Tags Generated
```
ghcr.io/chi-fragrance/scentxury-backend:1.2.3
ghcr.io/chi-fragrance/scentxury-backend:1.2
ghcr.io/chi-fragrance/scentxury-backend:1
ghcr.io/chi-fragrance/scentxury-backend:latest
```

---

## ⏰ Scheduled Jobs (`scheduled.yml`)

| Job | Schedule | Description |
|-----|----------|-------------|
| Security Scan | Daily 2 AM | npm audit + Snyk + CodeQL |
| Dependency Check | Weekly Sunday 3 AM | Check outdated packages, create PR |
| Cleanup | Monthly 1st 4 AM | Delete old workflow runs, prune Docker images |

---

## 🔐 Required Secrets

Configure these in your GitHub repository settings:

### Authentication
| Secret | Purpose |
|--------|---------|
| `GITHUB_TOKEN` | Auto-provided by GitHub |
| `CODECOV_TOKEN` | Coverage reporting |
| `SNYK_TOKEN` | Security scanning |

### AWS Deployment
| Secret | Purpose |
|--------|---------|
| `AWS_ACCESS_KEY_ID` | AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | AWS authentication |
| `AWS_REGION` | Target region (e.g., `eu-west-1`) |

### Notifications
| Secret | Purpose |
|--------|---------|
| `SLACK_WEBHOOK_URL` | Deployment notifications |

---

## 🌍 Environments

### Staging
- **URL**: https://staging-api.scentxury.com
- **Branch**: `develop`
- **Auto-deploy**: Yes
- **Protection**: None

### Production
- **URL**: https://api.scentxury.com
- **Branch**: `main`
- **Auto-deploy**: After staging
- **Protection**: Required reviewers, wait timer

---

## 📊 Status Badges

Add these to your README:

```markdown
![CI/CD](https://github.com/chi-fragrance/scentxury-backend/actions/workflows/ci-cd.yml/badge.svg)
![Security](https://github.com/chi-fragrance/scentxury-backend/actions/workflows/scheduled.yml/badge.svg)
[![codecov](https://codecov.io/gh/chi-fragrance/scentxury-backend/branch/main/graph/badge.svg)](https://codecov.io/gh/chi-fragrance/scentxury-backend)
```

---

## 🛠️ Local Development

### Running Tests Locally
```bash
# Start services
docker-compose up -d mongodb redis

# Run tests
npm run test

# Run with coverage
npm run test:coverage
```

### Simulating CI
```bash
# Install act (GitHub Actions local runner)
brew install act

# Run CI pipeline locally
act -j quality
act -j test
act -j build
```

---

## 🔧 Customization

### Adding New Jobs

```yaml
# In .github/workflows/ci-cd.yml
jobs:
  my-new-job:
    name: 🆕 New Job
    runs-on: ubuntu-latest
    needs: [quality, test]  # Dependencies
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello from new job!"
```

### Changing Deployment Target

To deploy to a different cloud provider, modify the deploy jobs:

```yaml
# For Railway
- name: Deploy to Railway
  run: railway up --service scentxury-api

# For Render
- name: Deploy to Render
  run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}

# For DigitalOcean App Platform
- name: Deploy to DO
  uses: digitalocean/app_action@v1
  with:
    token: ${{ secrets.DO_TOKEN }}
```

---

## 📈 Metrics & Monitoring

### Pipeline Metrics to Track
- Build duration
- Test pass rate
- Coverage percentage
- Deployment frequency
- Lead time for changes

### Viewing Metrics
1. Go to **Actions** tab
2. Click on workflow
3. View **Insights** section

---

## 🆘 Troubleshooting

### Common Issues

#### Tests Failing in CI but Passing Locally
```bash
# Ensure you're using the same Node version
nvm use 20

# Clear caches
rm -rf node_modules
npm ci

# Run tests in CI mode
CI=true npm run test
```

#### Docker Build Failing
```bash
# Check Dockerfile syntax
docker build --check .

# Build locally to debug
docker build -t test:latest . 2>&1 | tee build.log
```

#### Deployment Timeout
- Check ECS service health
- Verify environment variables
- Check application logs in CloudWatch

---

## 📚 References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Action](https://github.com/docker/build-push-action)
- [AWS ECS Deployment](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/)

---

**Last Updated**: January 2026
