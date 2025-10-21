use anchor_lang::prelude::*;

declare_id!("44444444444444444444444444444444");

#[program]
mod fartnode_registry {
	use super::*;

	pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
		msg!("FARTNODE registry program stub");
		Ok(())
	}
}

#[derive(Accounts)]
pub struct Initialize {}
