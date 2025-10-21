use anchor_lang::prelude::*;

declare_id!("22222222222222222222222222222222");

#[program]
mod fartnode_quests {
	use super::*;

	pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
		msg!("FARTNODE quests program stub");
		Ok(())
	}
}

#[derive(Accounts)]
pub struct Initialize {}
