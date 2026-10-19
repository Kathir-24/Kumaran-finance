# Kumaran Chits — AWS Infrastructure & Disaster Recovery Plan (DRP)

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Target Cloud**: Fresh AWS Account (Region: `ap-south-1` — Mumbai, India)  
> **Availability Targets**: $\text{RPO} \le 15\text{ minutes}$, $\text{RTO} \le 2\text{ hours}$

---

## 1. AWS Cloud Architecture Diagram

```mermaid
flowchart TD
    Internet((Internet)) --> WAF[AWS WAF / CloudFront\nDDoS Protection & TLS Termination]
    WAF --> ALB[Application Load Balancer / Caddy]

    subgraph VPC["AWS Virtual Private Cloud (ap-south-1)"]
        subgraph PublicSubnet["Public Subnet (AZ-1 & AZ-2)"]
            ALB
        end

        subgraph PrivateSubnet["Private App Subnet"]
            App1["NestJS API Container 1\n(ECS Fargate / EC2 Docker)"]
            App2["NestJS API Container 2\n(Redundancy)"]
            Worker["BullMQ Background Worker\n(Reminders & Reconciliations)"]
        end

        subgraph SecureDataSubnet["Isolated Database Subnet"]
            RDS[("AWS RDS PostgreSQL 17\n(Multi-AZ Automated Backups)\nAES-256 KMS Encryption")]
            Redis[("AWS ElastiCache Redis 7\n(Queue & Fast Caching)")]
        end
    end

    subgraph S3Bucket["AWS S3 Secure Storage"]
        KYCBucket["Private S3 Bucket\n(KYC Docs & Bilingual PDF Receipts)\nBlocked Public Access | KMS Encrypted"]
    end

    ALB --> App1
    ALB --> App2
    App1 --> RDS
    App2 --> RDS
    App1 --> Redis
    Worker --> Redis
    Worker --> RDS
    App1 --> KYCBucket
```

---

## 2. Fresh AWS Account Provisioning Checklist

### 2.1 Root Account & Security Hardening
1. **Enable Hardware/App MFA on AWS Root Account**: Use Microsoft Authenticator immediately upon account creation.
2. **Never use Root for deployment**: Create an administrative IAM user `admin-kumaran` with MFA for initial setup.
3. **Region Pinning**: Lock all resources to `ap-south-1` (Mumbai) for regulatory compliance and lowest latency to Tamil Nadu.
4. **AWS Cost & Budget Alerts**: Configure an AWS Budget alert at $50/month and $100/month to prevent surprise billing.

### 2.2 Network & Compute Configuration
- **VPC Setup**: 10.0.0.0/16 VPC with 2 Public Subnets (for ALB) and 2 Private Subnets (for App & Database).
- **Security Groups**:
  - `ALB-SG`: Ingress ports 80/443 from `0.0.0.0/0`.
  - `App-SG`: Ingress port 3000 solely from `ALB-SG`.
  - `DB-SG`: Ingress port 5432 solely from `App-SG`.
- **Database (AWS RDS PostgreSQL 17)**:
  - Instance: `db.t4g.micro` (Dev/Test) $\to$ `db.t4g.small` / `db.t4g.medium` (Production).
  - Storage: 20 GB gp3 with storage autoscaling up to 100 GB.
  - Automated backups enabled with **7-day point-in-time recovery (PITR)**.

---

## 3. Disaster Recovery Plan (DRP)

### 3.1 Recovery Metrics
| Metric | Target | How It Is Achieved |
|---|---|---|
| **Recovery Point Objective (RPO)** | **$\le 15$ minutes** | PostgreSQL continuous Write-Ahead Log (WAL) archiving to S3 via AWS RDS automated backups. |
| **Recovery Time Objective (RTO)** | **$\le 2$ hours** | Containerized app rebuild from Docker registry + automated point-in-time database snapshot restore. |

### 3.2 Backup Lifecycle & Retention Schedule
1. **Continuous Backups**: Automated RDS transactions backed up continuously for 7 days (point-in-time restore to any second).
2. **Daily Snapshot**: Encrypted RDS snapshot taken every midnight (02:00 AM IST) and retained for **30 days**.
3. **S3 Versioning & Replication**: S3 buckets storing customer KYC and PDF receipts have **Object Versioning enabled**, preventing accidental deletions.

### 3.3 Quarterly Disaster Recovery Drill Procedure
Once every 90 days, the developer and Kumaran Finance administrator execute this drill in a staging environment:
1. Trigger a restore of the latest RDS snapshot to a new temporary database instance.
2. Spin up a temporary NestJS API container connected to the restored database.
3. Execute the automated financial invariant tests (`pnpm test docs/05-testing/financial-tests.md`).
4. Verify that:
   $$\sum \text{Member Installment Dues} = \sum \text{Past Collections} + \text{Current Outstanding}$$
5. Confirm pass rate and terminate temporary staging resources.

### 3.4 Local & Branch Database Backup / Restore Runbook
For on-premise branch operations and local developer testing, automated PowerShell scripts in `infra/scripts/` provide immediate snapshot capabilities:

1. **Creating a Compressed Backup**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File infra\scripts\backup-db.ps1
   ```
   - Connects to the running `chitflow-db` container.
   - Executes `pg_dump -F c` creating a compressed binary archive in `infra/backups/`.
   - Guarantees whole-rupee `BigInt` precision and index integrity.

2. **Restoring from a Backup**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File infra\scripts\restore-db.ps1 -BackupFilePath "infra\backups\kumaran_chits_backup_YYYYMMDD_HHMMSS.dump"
   ```
   - Performs a clean, transactional restore using `pg_restore --clean`.

---

## 4. Production Go-Live Deployment Checklist (Local vs Live AWS)

Before launching the platform into live customer and partner operations in Perundurai, the DevOps engineer must verify all 5 infrastructure transitions from local development defaults to hardened AWS production configurations:

| Security Area | Local / Staging Default | Required in Live Production (AWS) | Implementation Verification |
|---|---|---|---|
| **HTTPS / TLS** | Local HTTP (`http://localhost:3000`) | Enforce HTTPS-only via **AWS CloudFront / Application Load Balancer (ALB)** with an auto-renewing **AWS Certificate Manager (ACM)** SSL/TLS certificate. | Port 80 traffic automatically redirects (HTTP 301) to HTTPS port 443. Plaintext HTTP is rejected at the load balancer. |
| **Secrets Storage** | Plain text `.env` file on local disk | Store sensitive credentials (`DATABASE_URL`, `JWT_SECRET`) in **AWS Secrets Manager** or **AWS SSM Parameter Store** (`SecureString`). | Zero production passwords or JWT keys committed to git, Docker images, or unencrypted disk storage. |
| **Database Subnet Isolation** | Docker container port `5433` exposed on `127.0.0.1` | Deploy **AWS RDS PostgreSQL 17** in a **Private VPC Subnet** with **zero public IP address** (`PubliclyAccessible: No`). | Security group `DB-SG` allows inbound port 5432 exclusively from the Application Security Group (`App-SG`). Zero direct internet access. |
| **S3 Bucket Encryption & Access** | Local filesystem (`./storage/uploads`) | Enable **AWS SSE-KMS** encryption and turn on **Block All Public Access** on S3 bucket. | S3 bucket blocks all public ACLs and bucket policies. Documents are strictly accessible via 15-minute temporary presigned URLs. |
| **Automated Database Backups** | Local PowerShell scripts (`infra/scripts/backup-db.ps1`) | Enable **AWS RDS Automated Backups** with **7-day Continuous Point-in-Time Recovery (PITR)** and daily snapshots retained for **30 days**. | Nightly automated snapshot scheduled at 02:00 AM IST. RPO $\le 15$ min, RTO $\le 2$ hours verified via quarterly recovery drill. |

### 4.1 Production Secrets Injection Architecture
In production container environments (AWS ECS Fargate or Docker):
- The NestJS API container does **not** mount a physical `.env` file.
- Instead, the ECS Task Definition directly references secrets by ARN from **AWS Secrets Manager**:
  ```json
  "secrets": [
    {
      "name": "DATABASE_URL",
      "valueFrom": "arn:aws:secretsmanager:ap-south-1:123456789012:secret:kumaran/production/db-url"
    },
    {
      "name": "JWT_SECRET",
      "valueFrom": "arn:aws:secretsmanager:ap-south-1:123456789012:secret:kumaran/production/jwt-secret"
    }
  ]
  ```
- AWS ECS injects the decrypted values directly into process environment variables in memory at container boot time, preventing disk exposure.

