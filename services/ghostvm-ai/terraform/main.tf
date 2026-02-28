terraform {
  required_version = ">= 1.5.0"
  required_providers {
    libvirt = {
      source  = "dmacvicar/libvirt"
      version = ">= 0.7.6"
    }
  }
}

provider "libvirt" {
  uri = var.libvirt_uri
}

resource "libvirt_network" "ghost_l1" {
  name      = "ghost-l1"
  mode      = "nat"
  domain    = "ghost.internal"
  addresses = ["10.20.0.0/24"]
}

resource "libvirt_network" "ghost_l2" {
  name      = "ghost-l2"
  mode      = "none"
  domain    = "ghost.internal"
  addresses = ["10.30.0.0/24"]
}

resource "libvirt_network" "ghost_l3" {
  name      = "ghost-l3"
  mode      = "none"
  domain    = "ghost.internal"
  addresses = ["10.40.0.0/24"]
}
