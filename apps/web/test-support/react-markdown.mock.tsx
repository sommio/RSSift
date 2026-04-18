import { Fragment, type ReactNode } from "react";

type ReactMarkdownProps = {
  children: string;
  components?: {
    h2?: (props: { children: ReactNode }) => ReactNode;
    li?: (props: { children: ReactNode }) => ReactNode;
    ol?: (props: { children: ReactNode }) => ReactNode;
    p?: (props: { children: ReactNode }) => ReactNode;
  };
};

function renderParagraph(
  block: string,
  renderers: ReactMarkdownProps["components"],
  key: string,
) {
  if (renderers?.p) {
    return <Fragment key={key}>{renderers.p({ children: block })}</Fragment>;
  }

  return <p key={key}>{block}</p>;
}

export default function MockReactMarkdown({
  children,
  components,
}: ReactMarkdownProps) {
  const blocks = children
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, index) => {
        const key = `block-${String(index)}`;

        if (block.startsWith("## ")) {
          const content = block.slice(3);

          if (components?.h2) {
            return (
              <Fragment key={key}>
                {components.h2({ children: content })}
              </Fragment>
            );
          }

          return <h2 key={key}>{content}</h2>;
        }

        if (/^\d+\.\s/m.test(block)) {
          const items = block
            .split("\n")
            .map((item) => item.replace(/^\d+\.\s/, ""));
          const listItems = items.map((item, itemIndex) => {
            const itemKey = `${key}-item-${String(itemIndex)}`;

            if (components?.li) {
              return (
                <Fragment key={itemKey}>
                  {components.li({ children: item })}
                </Fragment>
              );
            }

            return <li key={itemKey}>{item}</li>;
          });

          if (components?.ol) {
            return (
              <Fragment key={key}>
                {components.ol({ children: listItems })}
              </Fragment>
            );
          }

          return <ol key={key}>{listItems}</ol>;
        }

        return renderParagraph(block, components, key);
      })}
    </>
  );
}
