path "secret/data/ghostl-integrations/*" {
  capabilities = ["create", "update", "read", "list"]
}

path "secret/metadata/ghostl-integrations/*" {
  capabilities = ["read", "list"]
}

path "sys/health" {
  capabilities = ["read"]
}
