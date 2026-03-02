pid_file = "/tmp/vault-agent-api.pid"

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/vault/role_id"
      secret_id_file_path = "/vault/secret_id"
    }
  }

  sink "file" {
    config = {
      path = "/vault/token"
    }
  }
}

template {
  destination = "/vault/runtime/api.env"
  perms       = "0600"
  contents    = <<EOF
VAULT_ADDR={{ env "VAULT_ADDR" }}
VAULT_TOKEN={{ with file "/vault/token" }}{{ . | trimSpace }}{{ end }}
VAULT_AUTH_PATH=auth/approle/login
EOF
}
