//! Build-time engine for the Data Visualization Gallery.
//!
//!     dv-engine validate [--topic <slug>] [--root <repo>]
//!     dv-engine build [--explain <slug>[/<view>]] [--root <repo>]
//!     dv-engine parity-dump [--root <repo>]
//!
//! The browser engine in `apps/data-viz/web/src/engine/05-compute.js` must
//! stay in step with `features.rs`; `node tests/dataviz-parity.mjs` compares
//! them.

mod build;
mod features;
mod fmt;
mod goals;
mod json;
mod parity;
mod validate;

use std::path::PathBuf;

fn find_root(explicit: &Option<String>) -> Result<PathBuf, String> {
    if let Some(root) = explicit {
        return Ok(PathBuf::from(root));
    }
    let mut dir = std::env::current_dir().map_err(|e| format!("cwd: {e}"))?;
    loop {
        if dir
            .join("content")
            .join("data-viz")
            .join("manifest.json")
            .is_file()
        {
            return Ok(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    Err("找不到仓库根目录（content/data-viz/manifest.json）；用 --root 指定".to_string())
}

struct Args {
    command: String,
    root: Option<String>,
    topic: Option<String>,
    explain: Option<String>,
}

fn parse_args() -> Result<Args, String> {
    let mut args = std::env::args().skip(1).collect::<Vec<String>>().into_iter();
    let mut command: Option<String> = None;
    let mut root = None;
    let mut topic = None;
    let mut explain = None;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" => {
                root = Some(args.next().ok_or("--root 需要路径")?);
            }
            "--topic" => {
                topic = Some(args.next().ok_or("--topic 需要主题 id")?);
            }
            "--explain" => {
                explain = Some(args.next().ok_or("--explain 需要 slug[/view]")?);
            }
            "-h" | "--help" => {
                return Err(usage());
            }
            other => {
                if command.is_none() {
                    command = Some(other.to_string());
                } else {
                    return Err(format!("多余的参数：{other}"));
                }
            }
        }
    }
    Ok(Args {
        command: command.unwrap_or_else(|| "help".to_string()),
        root,
        topic,
        explain,
    })
}

fn usage() -> String {
    "用法：
  dv-engine validate [--topic <slug>]
  dv-engine build [--explain <slug>[/<view>]]
  dv-engine parity-dump
  （以上都可加 --root <仓库根目录>）"
        .to_string()
}

fn main() {
    let args = match parse_args() {
        Ok(args) => args,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };
    let root: PathBuf = match find_root(&args.root) {
        Ok(root) => root,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(2);
        }
    };
    let root = root.as_path();
    let code = match args.command.as_str() {
        "validate" => {
            let problems = validate::validate_all(root, args.topic.as_deref());
            if problems.is_empty() {
                println!("内容校验通过");
                0
            } else {
                println!("发现 {} 个问题：", problems.len());
                for problem in &problems {
                    println!("  - {problem}");
                }
                1
            }
        }
        "build" => match args.explain {
            Some(spec) => build::explain(root, &spec),
            None => build::run(root),
        },
        "parity-dump" => match parity::dump(root) {
            Ok(text) => {
                println!("{text}");
                0
            }
            Err(message) => {
                eprintln!("{message}");
                1
            }
        },
        "help" => {
            println!("{}", usage());
            0
        }
        other => {
            eprintln!("未知命令：{other}\n{}", usage());
            2
        }
    };
    std::process::exit(code);
}
