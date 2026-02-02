SELECT 'CREATE DATABASE ghostscout_l1 OWNER ghostscout'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ghostscout_l1') \gexec

SELECT 'CREATE DATABASE ghostscout_l2 OWNER ghostscout'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ghostscout_l2') \gexec

SELECT 'CREATE DATABASE ghostscout_l3 OWNER ghostscout'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ghostscout_l3') \gexec
