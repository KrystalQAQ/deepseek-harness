import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Creates the project registry and the append-only audit log. */
export class Init1712000000000 implements MigrationInterface {
  /** Human-readable migration name. */
  name = 'Init1712000000000'

  /**
   * Apply the schema.
   * @param queryRunner - runner bound to the gateway database.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      [
        'CREATE TABLE `dsh_project` (',
        '  `id` char(8) NOT NULL,',
        '  `name` varchar(64) NOT NULL,',
        '  `dir` varchar(512) NOT NULL,',
        '  `port` int NOT NULL,',
        '  `owner_uid` varchar(64) NOT NULL,',
        "  `status` enum('idle','starting','running','failed') NOT NULL DEFAULT 'idle',",
        '  `status_detail` varchar(255) DEFAULT NULL,',
        '  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
        '  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),',
        '  `last_started_at` datetime DEFAULT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `UK_dsh_project_dir` (`dir`),',
        '  UNIQUE KEY `UK_dsh_project_port` (`port`),',
        '  KEY `IDX_dsh_project_owner` (`owner_uid`)',
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
      ].join('\n'),
    )
    await queryRunner.query(
      [
        'CREATE TABLE `dsh_audit_log` (',
        '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
        '  `project_id` char(8) NOT NULL,',
        '  `actor_uid` varchar(64) NOT NULL,',
        '  `action` varchar(32) NOT NULL,',
        '  `detail` json DEFAULT NULL,',
        '  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
        '  PRIMARY KEY (`id`),',
        '  KEY `IDX_dsh_audit_project` (`project_id`,`created_at`)',
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
      ].join('\n'),
    )
  }

  /**
   * Drop the schema.
   * @param queryRunner - runner bound to the gateway database.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `dsh_audit_log`')
    await queryRunner.query('DROP TABLE IF EXISTS `dsh_project`')
  }
}
