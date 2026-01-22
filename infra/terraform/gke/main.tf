terraform {
  required_version = ">= 1.5.0"
}

locals {
  blueprint_dir = "../../k8s/blueprints"
}

output "blueprint_dir" {
  value = local.blueprint_dir
}
