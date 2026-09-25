CREATE DATABASE IF NOT EXISTS bot_farm;
USE bot_farm;

CREATE TABLE IF NOT EXISTS farms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  item VARCHAR(100) NOT NULL,
  quantidade INT NOT NULL,
  recebeu VARCHAR(100) NOT NULL,
  discord_id VARCHAR(30) NOT NULL,
  status ENUM('pendente','aprovado','reprovado') DEFAULT 'pendente',
  aprovado_por VARCHAR(100) NULL,
  motivo VARCHAR(255) NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
