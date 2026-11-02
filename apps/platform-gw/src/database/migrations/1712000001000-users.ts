import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Creates the account table the gateway now owns, replacing the platform's user store. */
export class Users1712000001000 implements MigrationInterface {
  /** @returns the migration name shown by the TypeORM CLI. */
  name = 'Users1712000001000'

  /**
   * @param queryRunner - runner bound to the configured schema.
   */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      [
        'CREATE TABLE `dsh_user` (',
        '  `id` char(32) NOT NULL,',
        '  `username` varchar(64) NOT NULL,',
        '  `display_name` varchar(64) NOT NULL,',
        '  `password_hash` varchar(255) NOT NULL,',
        "  `status` enum('active','locked') NOT NULL DEFAULT 'active',",
        '  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
        '  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `UK_dsh_user_username` (`username`)',
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci',
      ].join('\n'),
    )
  }

  /**
   * @param queryRunner - runner bound to the configured schema.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `dsh_user`')
  }
}
