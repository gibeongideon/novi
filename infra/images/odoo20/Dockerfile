# Stock Odoo 20 image built from the official tarball. NO code changes (DECISIONS D-01).
# The tarball is not in git; build with:  pnpm odoo:build   (see infra/images/odoo20/build.sh)
# Ubuntu 24.04 (Noble) ships Python 3.12, which matches Odoo's pinned requirements.
#
# Two stages: the builder unpacks the source and compiles the Python deps; the runtime image
# copies only the results (no compilers, and the 2.3 GB source is stored in a single layer).

# ── builder ───────────────────────────────────────────────────────────────────────────────
FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-dev build-essential pkg-config \
      libpq-dev libldap2-dev libsasl2-dev libxml2-dev libxslt1-dev libjpeg-dev zlib1g-dev \
      libffi-dev libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Unpacks the tarball (ADD auto-extracts local .tar.gz archives)
ADD odoo.tar.gz /src/
RUN mv /src/odoo-20.0+e.* /opt/odoo \
    && python3 -m venv $VIRTUAL_ENV \
    && pip install --no-cache-dir --upgrade pip wheel setuptools \
    && pip install --no-cache-dir -r /opt/odoo/requirements.txt \
    && find /opt/venv -name '__pycache__' -prune -exec rm -rf {} +

# ── runtime ───────────────────────────────────────────────────────────────────────────────
FROM ubuntu:24.04
LABEL org.opencontainers.image.source="https://github.com/gibeongideon/novi" \
      org.opencontainers.image.description="Stock Odoo 20 Enterprise (unmodified) for NOVI development and tests. Private." \
      org.opencontainers.image.licenses="LicenseRef-Odoo-Enterprise"
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/opt/odoo
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 libpq5 libldap2 libsasl2-2 libxml2 libxslt1.1 libjpeg-turbo8 zlib1g libffi8 \
      libmagic1 postgresql-client curl ca-certificates \
      fonts-dejavu-core fonts-noto-core xfonts-75dpi xfonts-base wkhtmltopdf \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --home-dir /var/lib/odoo --shell /usr/sbin/nologin odoo \
    && mkdir -p /etc/odoo /var/lib/odoo/filestore \
    && chown -R odoo:odoo /var/lib/odoo
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /opt/odoo /opt/odoo
USER odoo
WORKDIR /var/lib/odoo
EXPOSE 8069 8072
ENTRYPOINT ["python3", "/opt/odoo/setup/odoo"]
CMD ["--config=/etc/odoo/odoo.conf"]
