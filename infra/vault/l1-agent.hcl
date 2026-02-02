pid_file = "/tmp/vault-agent-l1.pid"

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
  destination = "infra/ghostchain/secrets/boot.key"
  perms       = "0600"
  contents    = "{{ with secret (printf \"%s\" (env \"VAULT_L1_PATH\" | default \"ghostchain/l1\")) }}{{ .Data.data.bootnode_key }}{{ end }}"
}

template {
  destination = "infra/ghostchain/secrets/node1.key"
  perms       = "0600"
  contents    = "{{ with secret (printf \"%s\" (env \"VAULT_L1_PATH\" | default \"ghostchain/l1\")) }}{{ .Data.data.node1_key }}{{ end }}"
}

template {
  destination = "infra/ghostchain/secrets/node2.key"
  perms       = "0600"
  contents    = "{{ with secret (printf \"%s\" (env \"VAULT_L1_PATH\" | default \"ghostchain/l1\")) }}{{ .Data.data.node2_key }}{{ end }}"
}

template {
  destination = "infra/ghostchain/secrets/jwtsecret"
  perms       = "0600"
  contents    = "{{ with secret (printf \"%s\" (env \"VAULT_L1_PATH\" | default \"ghostchain/l1\")) }}{{ .Data.data.jwtsecret }}{{ end }}"
}
